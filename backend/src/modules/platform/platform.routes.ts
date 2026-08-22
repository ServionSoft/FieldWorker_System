import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { platformRoute } from '../../middleware/tenant.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { notifyPlatformAdmins, parsePage, pageResult } from '../../utils/helpers.js';
import { encryptSecret, randomToken, sha256, signAccess } from '../../utils/crypto.js';
import { sendPlatformEmail, sendPlatformSmtpTest, recentEmailReceipts } from '../../services/email.js';
import { env } from '../../config/env.js';
import { stripeConfigured } from '../../services/stripe.js';
import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '../billing/plan-features.js';

const featureKeysSchema = z.array(z.enum(PLAN_FEATURE_KEYS as unknown as [PlanFeatureKey, ...PlanFeatureKey[]]));

export const platformRouter = Router();
platformRouter.use(requireAuth, requireRole('super_admin'));

platformRouter.get('/companies', platformRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT c.*, p.name AS plan_name,
       (SELECT count(*)::int FROM company_members m WHERE m.company_id = c.id AND m.status = 'active') AS employee_count
     FROM companies c JOIN subscription_plans p ON p.id = c.plan_id
     WHERE c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
  );
  const mapped = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? '',
    address: c.address ?? '',
    planId: c.plan_id,
    status: c.status,
    createdAt: c.created_at.toISOString().slice(0, 10),
    adminId: '',
    employeeCount: c.employee_count,
  }));
  const { page, pageSize } = parsePage(req.query);
  res.json(pageResult(mapped, page, pageSize));
}));

platformRouter.post('/companies', platformRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().default(''),
    address: z.string().optional().default(''),
    planId: z.string().uuid(),
    status: z.enum(['active', 'trial', 'suspended', 'past_due']).optional().default('trial'),
    ownerEmail: z.string().email().optional(),
    ownerName: z.string().optional(),
  }).parse(req.body);
  const trial = await client.query(`SELECT trial_days FROM platform_settings WHERE id = 1`);
  const days = trial.rows[0]?.trial_days ?? 14;
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + days);
  const created = await client.query(
    `INSERT INTO companies (name, email, phone, address, plan_id, status, trial_ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [body.name, body.email, body.phone, body.address, body.planId, body.status, body.status === 'trial' ? trialEnds.toISOString() : null],
  );
  const ownerEmail = body.ownerEmail || body.email;
  const token = randomToken();
  await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [created.rows[0].id]);
  const inv = await client.query(
    `INSERT INTO invitations (company_id, email, name, role, token_hash, invited_by, expires_at)
     VALUES ($1,$2,$3,'owner',$4,$5, now() + interval '7 days') RETURNING id`,
    [created.rows[0].id, ownerEmail, body.ownerName ?? body.name, sha256(token), req.auth.userId],
  );
  const link = `${(env.APP_PUBLIC_URL || env.CORS_ORIGIN).replace(/\/$/, '')}/invite/${token}`;
  await sendPlatformEmail({
    to: ownerEmail,
    templateType: 'tenant_invitation',
    vars: { companyName: body.name, role: 'owner', inviteLink: link },
  });
  await audit(client, {
    actorUserId: req.auth.userId, companyId: created.rows[0].id, action: 'company.create',
    entityType: 'company', entityId: created.rows[0].id,
  });
  await notifyPlatformAdmins(client, 'Company created', `${body.name} was added by Super Admin`, {
    eventKey: 'company.created', linkPath: `/super-admin/companies/${created.rows[0].id}`,
  });
  const c = created.rows[0];
  res.status(201).json({
    id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address,
    planId: c.plan_id, status: c.status, createdAt: c.created_at.toISOString().slice(0, 10),
    adminId: '', employeeCount: 0,
    inviteUrl: process.env.NODE_ENV !== 'production' ? link : undefined,
    invitationId: inv.rows[0].id,
  });
}));

platformRouter.patch('/companies/:id', platformRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    planId: z.string().uuid().optional(),
    status: z.enum(['active', 'trial', 'suspended']).optional(),
  }).parse(req.body);
  const r = await client.query(
    `UPDATE companies SET
       name = coalesce($3, name), email = coalesce($4, email), phone = coalesce($5, phone),
       address = coalesce($6, address), plan_id = coalesce($7, plan_id), status = coalesce($8, status)
     WHERE id = $2 AND $1::text IS NOT NULL AND deleted_at IS NULL RETURNING *`,
    ['x', req.params.id, body.name ?? null, body.email ?? null, body.phone ?? null, body.address ?? null, body.planId ?? null, body.status ?? null],
  );
  if (!r.rowCount) throw notFound('Company');
  if (body.status === 'suspended') {
    await audit(client, {
      actorUserId: req.auth.userId, companyId: req.params.id, action: 'company.suspend',
      entityType: 'company', entityId: req.params.id,
    });
  }
  const c = r.rows[0];
  res.json({
    id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address,
    planId: c.plan_id, status: c.status, createdAt: c.created_at.toISOString().slice(0, 10),
    adminId: '', employeeCount: 0,
  });
}));

platformRouter.delete('/companies/:id', platformRoute(async (req, res, client) => {
  const r = await client.query(
    `UPDATE companies SET deleted_at = now(), status = 'suspended' WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [req.params.id],
  );
  if (!r.rowCount) throw notFound('Company');
  res.json({ ok: true });
}));

platformRouter.get('/plans', platformRoute(async (_req, res, client) => {
  const { rows } = await client.query(`SELECT * FROM subscription_plans ORDER BY price_cents`);
  res.json({ items: rows.map((p) => mapPlanRow(p)) });
}));

platformRouter.get('/dashboard', platformRoute(async (_req, res, client) => {
  const companies = await client.query(`SELECT status, plan_id FROM companies WHERE deleted_at IS NULL`);
  const plans = await client.query(`SELECT id, name, price_cents FROM subscription_plans`);
  const employees = await client.query(
    `SELECT count(*)::int AS n FROM company_members m JOIN companies c ON c.id = m.company_id WHERE c.deleted_at IS NULL AND m.status = 'active'`,
  );
  const activity = await client.query(
    `SELECT action, created_at, metadata FROM audit_logs ORDER BY created_at DESC LIMIT 10`,
  );
  let mrr = 0;
  for (const c of companies.rows) {
    if (c.status === 'suspended') continue;
    const plan = plans.rows.find((p) => p.id === c.plan_id);
    if (plan) mrr += plan.price_cents / 100;
  }
  res.json({
    totalCompanies: companies.rows.length,
    activeSubscriptions: companies.rows.filter((c) => c.status === 'active').length,
    monthlyRevenue: mrr,
    totalEmployees: employees.rows[0].n,
    statusData: [
      { status: 'Active', count: companies.rows.filter((c) => c.status === 'active').length },
      { status: 'Trial', count: companies.rows.filter((c) => c.status === 'trial').length },
      { status: 'Suspended', count: companies.rows.filter((c) => c.status === 'suspended').length },
    ],
    planDistribution: plans.rows.map((p) => ({
      name: p.name,
      value: companies.rows.filter((c) => c.plan_id === p.id).length,
    })),
    activities: activity.rows.map((a) => ({
      text: a.action,
      time: a.created_at.toISOString(),
    })),
  });
}));

platformRouter.get('/reports', platformRoute(async (_req, res, client) => {
  const companies = await client.query(
    `SELECT date_trunc('month', created_at) AS month, count(*)::int AS n
     FROM companies WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
  );
  const jobs = await client.query(
    `SELECT category, count(*)::int AS n FROM jobs GROUP BY category`,
  );
  res.json({
    companyGrowth: companies.rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      companies: r.n,
    })),
    jobsByCategory: [
      { category: 'Plumbing', count: jobs.rows.find((j) => j.category === 'plumbing')?.n ?? 0 },
      { category: 'Electrical', count: jobs.rows.find((j) => j.category === 'electrical')?.n ?? 0 },
      { category: 'HVAC', count: jobs.rows.find((j) => j.category === 'hvac')?.n ?? 0 },
      { category: 'General', count: jobs.rows.find((j) => j.category === 'general')?.n ?? 0 },
    ],
  });
}));

function mapPlanRow(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price_cents) / 100,
    priceYearly: p.price_cents_yearly != null ? Number(p.price_cents_yearly) / 100 : Number(p.price_cents) * 12 / 100,
    billing: p.billing_interval,
    features: p.features,
    featureKeys: p.feature_keys ?? [],
    maxWorkers: p.max_workers,
    maxJobs: p.max_jobs,
    stripePriceIdMonthly: p.stripe_price_id_monthly,
    stripePriceIdYearly: p.stripe_price_id_yearly,
  };
}

platformRouter.get('/companies/:id', platformRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT c.*, p.name AS plan_name FROM companies c JOIN subscription_plans p ON p.id = c.plan_id WHERE c.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) throw notFound('Company');
  const c = rows[0];
  const members = await client.query(
    `SELECT m.id, m.role, m.status, u.id AS user_id, u.name, u.email
     FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 ORDER BY m.created_at`,
    [c.id],
  );
  const invoices = await client.query(
    `SELECT * FROM billing_invoices WHERE company_id = $1 ORDER BY created_at DESC LIMIT 25`,
    [c.id],
  );
  const invites = await client.query(
    `SELECT id, email, role, expires_at, accepted_at FROM invitations WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [c.id],
  );
  res.json({
    id: c.id, name: c.name, email: c.email, phone: c.phone ?? '', address: c.address ?? '',
    planId: c.plan_id, planName: c.plan_name, status: c.status,
    createdAt: c.created_at.toISOString().slice(0, 10),
    trialEndsAt: c.trial_ends_at ? c.trial_ends_at.toISOString() : null,
    stripeCustomerId: c.stripe_customer_id, stripeSubscriptionId: c.stripe_subscription_id,
    employeeCount: members.rows.filter((m) => m.status === 'active').length,
    members: members.rows.map((m) => ({
      id: m.id, userId: m.user_id, name: m.name, email: m.email, role: m.role, status: m.status,
    })),
    invitations: invites.rows.map((i) => ({
      id: i.id, email: i.email, role: i.role,
      expiresAt: i.expires_at.toISOString(),
      acceptedAt: i.accepted_at ? i.accepted_at.toISOString() : null,
    })),
    billingInvoices: invoices.rows.map((i) => ({
      id: i.id, number: i.number, amount: i.amount_cents / 100, status: i.status,
      hostedUrl: i.hosted_url, createdAt: i.created_at.toISOString(),
    })),
  });
}));

platformRouter.post('/companies/:id/invite-owner', platformRoute(async (req, res, client) => {
  const body = z.object({ email: z.string().email(), name: z.string().optional() }).parse(req.body);
  const company = await client.query(`SELECT id, name FROM companies WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
  if (!company.rowCount) throw notFound('Company');
  await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [req.params.id]);
  const token = randomToken();
  await client.query(
    `INSERT INTO invitations (company_id, email, name, role, token_hash, invited_by, expires_at)
     VALUES ($1,$2,$3,'owner',$4,$5, now() + interval '7 days')`,
    [req.params.id, body.email, body.name ?? null, sha256(token), req.auth.userId],
  );
  const link = `${(env.APP_PUBLIC_URL || env.CORS_ORIGIN).replace(/\/$/, '')}/invite/${token}`;
  await sendPlatformEmail({
    to: body.email,
    templateType: 'tenant_invitation',
    vars: { companyName: company.rows[0].name, role: 'owner', inviteLink: link },
  });
  res.json({ ok: true, inviteUrl: process.env.NODE_ENV !== 'production' ? link : undefined });
}));

platformRouter.post('/companies/:id/impersonate', platformRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT m.id, m.user_id, m.role, u.name, u.email
     FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.status = 'active' AND m.role IN ('owner','admin')
     ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at
     LIMIT 1`,
    [req.params.id],
  );
  if (!rows[0]) throw badRequest('Company has no owner or admin to impersonate');
  const m = rows[0];
  const accessToken = signAccess({
    userId: m.user_id,
    companyId: req.params.id,
    role: m.role,
    memberId: m.id,
    impersonatedBy: req.auth.userId,
  });
  await audit(client, {
    actorUserId: req.auth.userId, companyId: req.params.id, action: 'company.impersonate',
    entityType: 'company', entityId: req.params.id, metadata: { targetUserId: m.user_id },
  });
  res.json({
    accessToken,
    user: { id: m.user_id, name: m.name, email: m.email, role: m.role, companyId: req.params.id },
    companyId: req.params.id,
  });
}));

platformRouter.post('/plans', platformRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().min(1),
    price: z.number(),
    priceYearly: z.number().optional(),
    billing: z.enum(['monthly', 'yearly']).optional().default('monthly'),
    maxWorkers: z.number().int(),
    maxJobs: z.number().int(),
    features: z.array(z.string()).optional().default([]),
    featureKeys: featureKeysSchema.optional().default(['reports']),
    stripePriceIdMonthly: z.string().optional(),
    stripePriceIdYearly: z.string().optional(),
  }).parse(req.body);
  const r = await client.query(
    `INSERT INTO subscription_plans (name, price_cents, price_cents_yearly, billing_interval, max_workers, max_jobs, features, feature_keys, stripe_price_id_monthly, stripe_price_id_yearly)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      body.name, Math.round(body.price * 100), body.priceYearly != null ? Math.round(body.priceYearly * 100) : null,
      body.billing, body.maxWorkers, body.maxJobs, body.features, body.featureKeys,
      body.stripePriceIdMonthly ?? null, body.stripePriceIdYearly ?? null,
    ],
  );
  res.status(201).json(mapPlanRow(r.rows[0]));
}));

platformRouter.patch('/plans/:id', platformRoute(async (req, res, client) => {
  const body = z.object({
    price: z.number().optional(),
    priceYearly: z.number().optional(),
    name: z.string().optional(),
    maxWorkers: z.number().optional(),
    maxJobs: z.number().optional(),
    features: z.array(z.string()).optional(),
    featureKeys: featureKeysSchema.optional(),
    stripePriceIdMonthly: z.string().nullable().optional(),
    stripePriceIdYearly: z.string().nullable().optional(),
  }).parse(req.body);
  const r = await client.query(
    `UPDATE subscription_plans SET
       price_cents = coalesce($2, price_cents),
       price_cents_yearly = coalesce($3, price_cents_yearly),
       name = coalesce($4, name),
       max_workers = coalesce($5, max_workers),
       max_jobs = coalesce($6, max_jobs),
       features = coalesce($7, features),
       feature_keys = coalesce($8, feature_keys),
       stripe_price_id_monthly = coalesce($9, stripe_price_id_monthly),
       stripe_price_id_yearly = coalesce($10, stripe_price_id_yearly)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      body.price != null ? Math.round(body.price * 100) : null,
      body.priceYearly != null ? Math.round(body.priceYearly * 100) : null,
      body.name ?? null,
      body.maxWorkers ?? null,
      body.maxJobs ?? null,
      body.features ?? null,
      body.featureKeys ?? null,
      body.stripePriceIdMonthly ?? null,
      body.stripePriceIdYearly ?? null,
    ],
  );
  if (!r.rowCount) throw notFound('Plan');
  res.json(mapPlanRow(r.rows[0]));
}));

platformRouter.get('/settings', platformRoute(async (_req, res, client) => {
  const { rows } = await client.query(`SELECT * FROM platform_settings WHERE id = 1`);
  const s = rows[0] ?? {};
  res.json({
    smtp: {
      host: s.smtp_host ?? '',
      port: s.smtp_port ?? 587,
      user: s.smtp_user ?? '',
      secure: s.smtp_secure ?? true,
      fromName: s.smtp_from_name ?? '',
      fromEmail: s.smtp_from_email ?? '',
      replyTo: s.smtp_reply_to ?? '',
      configured: Boolean(s.smtp_host),
    },
    trialDays: s.trial_days ?? 14,
    supportEmail: s.support_email ?? '',
    stripeConfigured: stripeConfigured(),
  });
}));

platformRouter.patch('/settings', platformRoute(async (req, res, client) => {
  const body = z.object({
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    smtpSecure: z.boolean().optional(),
    smtpFromName: z.string().optional(),
    smtpFromEmail: z.string().email().optional().or(z.literal('')),
    smtpReplyTo: z.string().email().optional().or(z.literal('')),
    trialDays: z.number().int().optional(),
    supportEmail: z.string().email().optional().or(z.literal('')),
  }).parse(req.body);
  const passwordEnc = body.smtpPassword ? encryptSecret(body.smtpPassword) : null;
  await client.query(
    `UPDATE platform_settings SET
       smtp_host = coalesce($1, smtp_host),
       smtp_port = coalesce($2, smtp_port),
       smtp_user = coalesce($3, smtp_user),
       smtp_password_enc = coalesce($4, smtp_password_enc),
       smtp_secure = coalesce($5, smtp_secure),
       smtp_from_name = coalesce($6, smtp_from_name),
       smtp_from_email = coalesce($7, smtp_from_email),
       smtp_reply_to = coalesce($8, smtp_reply_to),
       trial_days = coalesce($9, trial_days),
       support_email = coalesce($10, support_email)
     WHERE id = 1`,
    [
      body.smtpHost ?? null, body.smtpPort ?? null, body.smtpUser ?? null, passwordEnc,
      body.smtpSecure ?? null, body.smtpFromName ?? null, body.smtpFromEmail || null,
      body.smtpReplyTo || null,
      body.trialDays ?? null, body.supportEmail || null,
    ],
  );
  res.json({ ok: true });
}));

platformRouter.post('/settings/smtp/test', platformRoute(async (req, res) => {
  const body = z.object({ to: z.string().email().optional() }).parse(req.body ?? {});
  const result = await sendPlatformSmtpTest(body.to);
  if (!result.ok) throw badRequest(result.error);
  res.json({ ok: true, channel: 'platform', evidence: result.evidence });
}));

platformRouter.get('/email-receipts', platformRoute(async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw badRequest('Email receipts are not available in production');
  }
  res.json({ items: recentEmailReceipts(250) });
}));

platformRouter.get('/email-templates', platformRoute(async (_req, res, client) => {
  const { rows } = await client.query(`SELECT type, name, subject, body FROM platform_email_templates ORDER BY type`);
  res.json({ items: rows });
}));

platformRouter.patch('/email-templates/:type', platformRoute(async (req, res, client) => {
  const type = z.enum([
    'password_reset', 'welcome', 'tenant_invitation', 'system_notification', 'subscription_started', 'payment_failed',
  ]).parse(req.params.type);
  const body = z.object({
    name: z.string().min(1).optional(),
    subject: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
  }).parse(req.body);
  const r = await client.query(
    `UPDATE platform_email_templates SET
       name = coalesce($2, name), subject = coalesce($3, subject), body = coalesce($4, body), updated_at = now()
     WHERE type = $1 RETURNING type, name, subject, body`,
    [type, body.name ?? null, body.subject ?? null, body.body ?? null],
  );
  if (!r.rowCount) throw notFound('Template');
  res.json(r.rows[0]);
}));

platformRouter.get('/audit', platformRoute(async (req, res, client) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const { rows } = await client.query(
    `SELECT a.*, u.email AS actor_email, c.name AS company_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN companies c ON c.id = a.company_id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );
  const total = await client.query(`SELECT count(*)::int AS n FROM audit_logs`);
  res.json({
    items: rows.map((a) => ({
      id: a.id,
      action: a.action,
      actorEmail: a.actor_email,
      companyName: a.company_name,
      entityType: a.entity_type,
      entityId: a.entity_id,
      metadata: a.metadata,
      createdAt: a.created_at.toISOString(),
    })),
    page, pageSize, total: total.rows[0].n,
  });
}));

platformRouter.get('/billing-invoices', platformRoute(async (req, res, client) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const { rows } = await client.query(
    `SELECT b.*, c.name AS company_name
     FROM billing_invoices b JOIN companies c ON c.id = b.company_id
     ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );
  res.json({
    items: rows.map((i) => ({
      id: i.id, companyName: i.company_name, number: i.number,
      amount: i.amount_cents / 100, status: i.status, hostedUrl: i.hosted_url,
      createdAt: i.created_at.toISOString(),
    })),
  });
}));
