import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { wrap } from '../../utils/async.js';
import {
  hashPassword, verifyPassword, signAccess, signRefresh, sha256, randomToken, verifyRefresh,
} from '../../utils/crypto.js';
import { unauthorized, badRequest, conflict, forbidden } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import type { AuthedRequest, AppRole } from '../../types.js';
import { loadEffectivePermissions, PERMISSIONS } from '../rbac/permissions.js';
import { notify, notifyPlatformAdmins } from '../../utils/helpers.js';
import { sendPlatformEmail } from '../../services/email.js';
import { env } from '../../config/env.js';
import { loadPlanFeatures } from '../billing/plan-features.js';
import { isCompanyProfileComplete } from '../company/onboarding.js';

export const authRouter = Router();

async function loadSession(userId: string) {
  const { rows: users } = await pool.query(
    `SELECT id, email, name, phone, avatar_url, avatar_key, is_platform_admin,
            first_name, last_name, job_title, timezone, locale, last_login_at, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) return null;

  const publicUser = {
    id: user.id,
    name: user.name,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    email: user.email,
    phone: user.phone,
    avatar: user.avatar_key ? '/api/profile/avatar' : (user.avatar_url || null),
    hasAvatar: Boolean(user.avatar_key),
    jobTitle: user.job_title || null,
    timezone: user.timezone || 'America/Chicago',
    locale: user.locale || 'en',
    createdAt: user.created_at ? new Date(user.created_at).toISOString() : null,
    lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
  };

  if (user.is_platform_admin) {
    return {
      user: {
        ...publicUser,
        role: 'super_admin' as AppRole,
        companyId: null,
      },
      company: null,
      memberId: null,
      role: 'super_admin' as AppRole,
      permissions: [...PERMISSIONS],
      planFeatures: [] as string[],
    };
  }

  const { rows: members } = await pool.query(
    `SELECT m.id, m.company_id, m.role, m.status, m.notify_email_assignments, m.notify_email_invoices, m.notify_email_billing,
            c.name, c.status AS company_status, c.phone, c.email AS company_email, c.address, c.trial_ends_at,
            c.timezone, c.business_type, c.onboarding_completed_at
     FROM company_members m
     JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 AND m.status = 'active' AND c.deleted_at IS NULL
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [userId],
  );
  const member = members[0];
  if (!member) return null;

  const client = await pool.connect();
  let permissions: string[] = [];
  let planFeatures: string[] = [];
  try {
    // RLS on company_member_permissions requires tenant GUC (same as tenantRoute)
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [member.company_id]);
    permissions = await loadEffectivePermissions(client, member.id, member.role as AppRole);
    planFeatures = await loadPlanFeatures(client, member.company_id);
  } finally {
    client.release();
  }

  return {
    user: {
      ...publicUser,
      role: member.role as AppRole,
      companyId: member.company_id,
    },
    company: {
      id: member.company_id,
      name: member.name,
      status: member.company_status,
      phone: member.phone,
      email: member.company_email,
      address: member.address,
      timezone: member.timezone || 'America/Chicago',
      businessType: member.business_type || null,
      trialEndsAt: member.trial_ends_at ? member.trial_ends_at.toISOString() : null,
      onboardingRequired: !isCompanyProfileComplete({
        name: member.name,
        email: member.company_email,
        phone: member.phone,
        address: member.address,
        timezone: member.timezone || 'America/Chicago',
      }),
      onboardingComplete: Boolean(member.onboarding_completed_at),
    },
    memberId: member.id,
    role: member.role as AppRole,
    permissions,
    planFeatures,
    preferences: {
      notifyEmailAssignments: member.notify_email_assignments,
      notifyEmailInvoices: member.notify_email_invoices,
      notifyEmailBilling: member.notify_email_billing,
    },
  };
}

function tokensFor(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  const accessToken = signAccess({
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.role,
    memberId: session.memberId,
  });
  const refreshToken = signRefresh(session.user.id);
  return { accessToken, refreshToken };
}

authRouter.post('/register', wrap(async (req, res) => {
  const body = z.object({
    companyName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }).parse(req.body);

  const payload = await withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
    if (existing.rowCount) throw conflict('Email already registered');

    const plan = await client.query(
      `SELECT id FROM subscription_plans WHERE name = 'Basic' LIMIT 1`,
    );
    if (!plan.rowCount) throw badRequest('Plans are not configured');

    const passwordHash = await hashPassword(body.password);
    const user = await client.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name`,
      [body.email, passwordHash, body.companyName],
    );
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);
    const company = await client.query(
      `INSERT INTO companies (name, email, plan_id, status, trial_ends_at)
       VALUES ($1,$2,$3,'trial',$4) RETURNING id, name, status, phone, email, address`,
      [body.companyName, body.email, plan.rows[0].id, trialEnds.toISOString()],
    );
    const member = await client.query(
      `INSERT INTO company_members (company_id, user_id, role, status)
       VALUES ($1,$2,'owner','active') RETURNING id`,
      [company.rows[0].id, user.rows[0].id],
    );
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [company.rows[0].id]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.rows[0].id]);
    await audit(client, {
      actorUserId: user.rows[0].id,
      companyId: company.rows[0].id,
      action: 'company.register',
      entityType: 'company',
      entityId: company.rows[0].id,
      ip: req.ip,
    });
    await notify(client, {
      companyId: company.rows[0].id,
      userId: user.rows[0].id,
      title: 'Welcome to FieldPro',
      message: `Your 14-day trial for ${body.companyName} has started`,
      type: 'success',
      eventKey: 'company.welcome',
      linkPath: '/admin/settings?tab=billing',
    });
    await sendPlatformEmail({
      to: body.email,
      templateType: 'welcome',
      vars: { companyName: body.companyName },
    });
    await notifyPlatformAdmins(
      client,
      'New Company Registered',
      `${body.companyName} has started a trial subscription`,
      { eventKey: 'company.registered', linkPath: '/super-admin/companies' },
    );

    const session = {
      user: {
        id: user.rows[0].id,
        name: user.rows[0].name,
        email: user.rows[0].email,
        role: 'owner' as AppRole,
        companyId: company.rows[0].id,
        phone: null as string | null,
        avatar: null as string | null,
      },
      company: {
        ...company.rows[0],
        timezone: 'America/Chicago',
        onboardingRequired: true,
        onboardingComplete: false,
      },
      memberId: member.rows[0].id,
      role: 'owner' as AppRole,
      permissions: [...PERMISSIONS],
      planFeatures: await loadPlanFeatures(client, company.rows[0].id),
    };
    const { accessToken, refreshToken } = tokensFor(session);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '14 days')`,
      [session.user.id, sha256(refreshToken)],
    );
    return { ...session, accessToken, refreshToken };
  });
  res.status(201).json(payload);
}));

authRouter.post('/login', wrap(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const { rows } = await pool.query(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [body.email],
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(row.password_hash, body.password))) {
    throw unauthorized('Invalid credentials');
  }
  const session = await loadSession(row.id);
  if (!session) throw unauthorized('No active membership');
  if (session.company?.status === 'suspended') throw forbidden('Company is suspended');
  if (
    session.company?.status === 'trial' &&
    session.company.trialEndsAt &&
    new Date(session.company.trialEndsAt) < new Date()
  ) {
    throw forbidden('Trial expired');
  }

  const { accessToken, refreshToken } = tokensFor(session);
  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [session.user.id]);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '14 days')`,
      [session.user.id, sha256(refreshToken)],
    );
    await audit(client, {
      actorUserId: session.user.id,
      companyId: session.user.companyId,
      action: 'auth.login',
      ip: req.ip,
    });
  });
  res.json({ ...session, accessToken, refreshToken });
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const body = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  let payload: { userId: string };
  try {
    payload = verifyRefresh(body.refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const hash = sha256(body.refreshToken);
  const { rows } = await pool.query(
    `SELECT id FROM refresh_tokens
     WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [payload.userId, hash],
  );
  if (!rows[0]) throw unauthorized('Refresh token revoked');

  const session = await loadSession(payload.userId);
  if (!session) throw unauthorized();

  const next = tokensFor(session);
  await withTransaction(async (client) => {
    await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [rows[0].id]);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '14 days')`,
      [session.user.id, sha256(next.refreshToken)],
    );
  });
  res.json({ ...session, ...next });
}));

authRouter.post('/logout', requireAuth, wrap(async (req, res) => {
  const body = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
  if (body.refreshToken) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
      [sha256(body.refreshToken)],
    );
  }
  res.json({ ok: true });
}));

authRouter.post('/forgot-password', wrap(async (req, res) => {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [body.email]);
  if (rows[0]) {
    const token = randomToken();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '1 hour')`,
      [rows[0].id, sha256(token)],
    );
    const base = env.CORS_ORIGIN;
    const link = `${base.replace(/\/$/, '')}/reset-password?token=${token}`;
    await sendPlatformEmail({
      to: body.email,
      templateType: 'password_reset',
      vars: { resetLink: link },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Password reset token for ${body.email}: ${token}`);
    }
  }
  res.json({ ok: true });
}));

authRouter.post('/reset-password', wrap(async (req, res) => {
  const body = z.object({ token: z.string().min(1), password: z.string().min(8) }).parse(req.body);
  const { rows } = await pool.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [sha256(body.token)],
  );
  if (!rows[0]) throw badRequest('Invalid or expired reset token');
  const passwordHash = await hashPassword(body.password);
  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, rows[0].user_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [rows[0].id]);
    await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [rows[0].user_id]);
  });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const session = await loadSession((req as AuthedRequest).auth.userId);
  if (!session) throw unauthorized();
  res.json({
    ...session,
    impersonatedBy: (req as AuthedRequest).auth.impersonatedBy ?? null,
  });
}));

authRouter.patch('/me/preferences', requireAuth, wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (!auth.memberId || !auth.companyId) throw forbidden('Tenant membership required');
  const body = z.object({
    notifyEmailAssignments: z.boolean().optional(),
    notifyEmailInvoices: z.boolean().optional(),
    notifyEmailBilling: z.boolean().optional(),
  }).parse(req.body);
  await pool.query(
    `UPDATE company_members SET
       notify_email_assignments = coalesce($3, notify_email_assignments),
       notify_email_invoices = coalesce($4, notify_email_invoices),
       notify_email_billing = coalesce($5, notify_email_billing)
     WHERE id = $1 AND company_id = $2`,
    [auth.memberId, auth.companyId, body.notifyEmailAssignments ?? null, body.notifyEmailInvoices ?? null, body.notifyEmailBilling ?? null],
  );
  const { rows } = await pool.query(
    `SELECT notify_email_assignments, notify_email_invoices, notify_email_billing FROM company_members WHERE id = $1`,
    [auth.memberId],
  );
  res.json({
    notifyEmailAssignments: rows[0]?.notify_email_assignments,
    notifyEmailInvoices: rows[0]?.notify_email_invoices,
    notifyEmailBilling: rows[0]?.notify_email_billing,
  });
}));
