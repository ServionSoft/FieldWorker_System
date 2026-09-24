import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { encryptSecret } from '../../utils/crypto.js';
import { sendTenantSmtpTest } from '../../services/email.js';
import { loadTenantTwilio, twilioWebhookUrls, verifyTwilioCredentials } from '../../services/twilio.js';
import { toE164 } from '../../utils/phone.js';
import { isCompanyProfileComplete } from './onboarding.js';
import { invoiceSettingsPatchSchema, parseInvoiceSettings } from './invoice-settings.js';
import { pool, withTenant } from '../../db/pool.js';
import type { AuthedRequest } from '../../types.js';
import type { Request, Response, NextFunction } from 'express';

export const companyRouter = Router();
companyRouter.use(requireAuth, requireTenant, requireRole('admin'));

companyRouter.get('/', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT c.id, c.name, c.email, c.phone, c.address, c.status, c.plan_id, c.twilio_number,
            c.timezone, c.default_tax_pct, c.website, c.invoice_footer, c.logo_file_id, c.invoice_settings,
            c.trial_ends_at, c.stripe_customer_id, c.stripe_subscription_id, c.business_type, c.onboarding_completed_at,
            p.name AS plan_name
     FROM companies c JOIN subscription_plans p ON p.id = c.plan_id WHERE c.id = $1`,
    [req.auth.companyId],
  );
  if (!rows[0]) throw notFound('Company');
  const smtp = await client.query(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_secure, smtp_from_name, smtp_from_email, smtp_reply_to, smtp_password_enc,
            twilio_account_sid, twilio_auth_token_enc, twilio_from_number
     FROM company_settings WHERE company_id = $1`,
    [req.auth.companyId],
  );
  const s = smtp.rows[0];
  const c = rows[0];
  const twilioCreds = await loadTenantTwilio(client, req.auth.companyId!);
  res.json({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    status: c.status,
    planId: c.plan_id,
    planName: c.plan_name,
    twilioNumber: c.twilio_number,
    timezone: c.timezone || 'America/Chicago',
    defaultTaxPct: c.default_tax_pct != null ? Number(c.default_tax_pct) : 0,
    website: c.website,
    invoiceFooter: c.invoice_footer,
    logoFileId: c.logo_file_id,
    invoiceSettings: parseInvoiceSettings(c.invoice_settings),
    trialEndsAt: c.trial_ends_at ? c.trial_ends_at.toISOString() : null,
    businessType: c.business_type || null,
    onboardingRequired: !isCompanyProfileComplete({
      name: c.name, email: c.email, phone: c.phone, address: c.address, timezone: c.timezone || 'America/Chicago',
    }),
    onboardingComplete: Boolean(c.onboarding_completed_at),
    smtp: {
      host: s?.smtp_host ?? '',
      port: s?.smtp_port ?? 587,
      user: s?.smtp_user ?? '',
      secure: s?.smtp_secure ?? true,
      fromName: s?.smtp_from_name ?? '',
      fromEmail: s?.smtp_from_email ?? '',
      replyTo: s?.smtp_reply_to ?? '',
      configured: Boolean(s?.smtp_password_enc || s?.smtp_host),
    },
    twilio: {
      accountSid: s?.twilio_account_sid ?? '',
      fromNumber: s?.twilio_from_number || c.twilio_number || '',
      configured: Boolean(s?.twilio_account_sid && s?.twilio_auth_token_enc),
      hasAuthToken: Boolean(s?.twilio_auth_token_enc),
      source: twilioCreds?.source ?? null,
      webhooks: twilioWebhookUrls(),
    },
  });
}));

companyRouter.patch('/', requirePermission('settings.company'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().nullish(),
    address: z.string().nullish(),
    twilioNumber: z.string().nullish(),
    timezone: z.string().nullish(),
    defaultTaxPct: z.number().optional(),
    website: z.string().nullish(),
    invoiceFooter: z.string().nullish(),
    logoFileId: z.string().uuid().nullable().optional(),
    businessType: z.enum(['plumbing', 'electrical', 'hvac', 'general']).nullable().optional(),
    invoiceSettings: invoiceSettingsPatchSchema.optional(),
  }).parse(req.body);
  const str = (v: string | null | undefined) => (v == null ? null : String(v));
  const r = await client.query(
    `UPDATE companies SET
       name = coalesce($2, name), email = coalesce($3, email), phone = coalesce($4, phone), address = coalesce($5, address),
       twilio_number = coalesce($6, twilio_number), timezone = coalesce($7, timezone),
       default_tax_pct = coalesce($8, default_tax_pct), website = coalesce($9, website),
       invoice_footer = coalesce($10, invoice_footer),
       logo_file_id = CASE WHEN $11::boolean THEN $12::uuid ELSE logo_file_id END,
       business_type = CASE WHEN $13::text IS NULL THEN business_type ELSE $13 END,
       invoice_settings = CASE
         WHEN $14::jsonb IS NULL THEN invoice_settings
         ELSE COALESCE(invoice_settings, '{}'::jsonb) || $14::jsonb
       END
     WHERE id = $1 RETURNING id, name, email, phone, address, timezone, business_type`,
    [
      req.auth.companyId,
      body.name ?? null, body.email ?? null, str(body.phone), str(body.address),
      str(body.twilioNumber), str(body.timezone), body.defaultTaxPct ?? null,
      str(body.website), str(body.invoiceFooter),
      body.logoFileId !== undefined,
      body.logoFileId ?? null,
      body.businessType === undefined ? null : body.businessType,
      body.invoiceSettings === undefined ? null : JSON.stringify(body.invoiceSettings),
    ],
  );
  if (!r.rowCount) throw notFound('Company');
  res.json({ ok: true, onboardingRequired: !isCompanyProfileComplete(r.rows[0]) });
}));

companyRouter.post('/onboarding/complete', requirePermission('settings.company'), tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT name, email, phone, address, timezone FROM companies WHERE id = $1`,
    [req.auth.companyId],
  );
  if (!rows[0]) throw notFound('Company');
  if (!isCompanyProfileComplete(rows[0])) {
    throw badRequest('Complete required company information before finishing setup');
  }
  await client.query(
    `UPDATE companies SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()) WHERE id = $1`,
    [req.auth.companyId],
  );
  res.json({ ok: true, onboardingComplete: true, onboardingRequired: false });
}));

companyRouter.patch('/smtp', requirePermission('settings.smtp'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    host: z.string().optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    secure: z.boolean().optional(),
    fromName: z.string().optional(),
    fromEmail: z.string().email().optional().or(z.literal('')),
    replyTo: z.string().email().optional().or(z.literal('')),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  await client.query(
    `INSERT INTO company_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  );
  const passwordEnc = body.password ? encryptSecret(body.password) : null;
  await client.query(
    `UPDATE company_settings SET
       smtp_host = coalesce($2, smtp_host),
       smtp_port = coalesce($3, smtp_port),
       smtp_user = coalesce($4, smtp_user),
       smtp_password_enc = coalesce($5, smtp_password_enc),
       smtp_secure = coalesce($6, smtp_secure),
       smtp_from_name = coalesce($7, smtp_from_name),
       smtp_from_email = coalesce($8, smtp_from_email),
       smtp_reply_to = coalesce($9, smtp_reply_to)
     WHERE company_id = $1`,
    [
      companyId, body.host ?? null, body.port ?? null, body.user ?? null, passwordEnc,
      body.secure ?? null, body.fromName ?? null, body.fromEmail || null, body.replyTo || null,
    ],
  );
  res.json({ ok: true, configured: true });
}));

/** SMTP I/O runs outside the DB transaction to avoid idle-in-transaction timeouts. */
companyRouter.post('/smtp/test', requirePermission('settings.smtp'), requireTenant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const companyId = auth.companyId!;
    const { rows } = await pool.query(
      `SELECT status, trial_ends_at FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId],
    );
    const company = rows[0];
    if (!company) throw forbidden('Company not found');
    if (company.status === 'suspended') throw forbidden('Company is suspended');
    if (company.status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
      throw forbidden('Trial expired');
    }
    const body = z.object({ to: z.string().email().optional() }).parse(req.body ?? {});
    const result = await sendTenantSmtpTest(companyId, body.to);
    if (!result.ok) throw badRequest(result.error);
    res.json({ ok: true, channel: 'tenant', evidence: result.evidence });
  } catch (err) {
    next(err);
  }
});

companyRouter.patch('/twilio', requirePermission('settings.company'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    accountSid: z.string().trim().min(10).max(64),
    authToken: z.string().trim().max(128).optional().or(z.literal('')),
    fromNumber: z.string().trim().min(8).max(32),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const from = toE164(body.fromNumber);
  if (!from) throw badRequest('Enter a valid Twilio From number in E.164 format, e.g. +15551234567');
  const token = (body.authToken || '').trim();
  if (token && token.length < 8) throw badRequest('Auth token is too short');
  await client.query(
    `INSERT INTO company_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  );
  const existing = await client.query(
    `SELECT twilio_auth_token_enc FROM company_settings WHERE company_id = $1`,
    [companyId],
  );
  const tokenEnc = token ? encryptSecret(token) : null;
  if (!tokenEnc && !existing.rows[0]?.twilio_auth_token_enc) {
    throw badRequest('Auth token is required');
  }
  await client.query(
    `UPDATE company_settings SET
       twilio_account_sid = $2,
       twilio_auth_token_enc = coalesce($3, twilio_auth_token_enc),
       twilio_from_number = $4
     WHERE company_id = $1`,
    [companyId, body.accountSid, tokenEnc, from],
  );
  await client.query(`UPDATE companies SET twilio_number = $2 WHERE id = $1`, [companyId, from]);
  res.json({ ok: true, configured: true, fromNumber: from });
}));

companyRouter.post('/twilio/test', requirePermission('settings.company'), requireTenant, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const companyId = auth.companyId!;
    const { rows } = await pool.query(
      `SELECT status, trial_ends_at FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId],
    );
    const company = rows[0];
    if (!company) throw forbidden('Company not found');
    if (company.status === 'suspended') throw forbidden('Company is suspended');
    if (company.status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
      throw forbidden('Trial expired');
    }
    const creds = await withTenant(companyId, null, true, (client) => loadTenantTwilio(client, companyId));
    if (!creds) throw badRequest('Twilio is not configured. Save Account SID, Auth Token, and From number first.');
    const result = await verifyTwilioCredentials(creds.accountSid, creds.authToken);
    if (!result.ok) throw badRequest(result.error);
    res.json({ ok: true, friendlyName: result.friendlyName, source: creds.source });
  } catch (err) {
    next(err);
  }
});

