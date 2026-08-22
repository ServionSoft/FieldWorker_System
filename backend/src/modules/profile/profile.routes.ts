import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { wrap } from '../../utils/async.js';
import { env } from '../../config/env.js';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../utils/errors.js';
import { hashPassword, sha256, signAccess, signRefresh, verifyPassword } from '../../utils/crypto.js';
import type { AuthedRequest, AppRole } from '../../types.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const AVATAR_MAX = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const avatarDir = path.resolve(env.FILE_LOCAL_DIR, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  dest: avatarDir,
  limits: { fileSize: AVATAR_MAX },
});

export const newPasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function avatarAbsPath(key: string) {
  const full = path.resolve(env.FILE_LOCAL_DIR, key);
  const root = path.resolve(env.FILE_LOCAL_DIR);
  if (!full.startsWith(root)) throw badRequest('Invalid avatar');
  return full;
}

function removeAvatarFile(key: string | null | undefined) {
  if (!key) return;
  try {
    const full = avatarAbsPath(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch { /* ignore */ }
}

async function loadWorkerSnapshot(companyId: string | null, memberId: string | null) {
  if (!companyId || !memberId) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
    const { rows } = await client.query(
      `SELECT wp.id, wp.employment_status, wp.rating, wp.jobs_completed
       FROM worker_profiles wp WHERE wp.member_id = $1 AND wp.company_id = $2`,
      [memberId, companyId],
    );
    const wp = rows[0];
    if (!wp) return null;
    const specs = (await client.query(
      `SELECT name FROM worker_specialties WHERE worker_profile_id = $1 ORDER BY name`,
      [wp.id],
    )).rows.map((r: { name: string }) => r.name);
    const availRows = (await client.query(
      `SELECT weekday, start_time, end_time FROM worker_availability WHERE worker_profile_id = $1`,
      [wp.id],
    )).rows as { weekday: number; start_time: string | null; end_time: string | null }[];
    const availability: Record<string, { start: string; end: string } | null> = {};
    DAYS.forEach((d, i) => {
      const row = availRows.find((r) => r.weekday === i);
      availability[d] = row?.start_time && row?.end_time
        ? { start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5) }
        : null;
    });
    return {
      specialties: specs,
      employmentStatus: wp.employment_status as string,
      rating: Number(wp.rating),
      jobsCompleted: wp.jobs_completed as number,
      availability,
    };
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    client.release();
  }
}

async function buildProfile(auth: AuthedRequest['auth']) {
  const userId = auth.userId;
  const { rows: users } = await pool.query(
    `SELECT id, email, name, phone, avatar_key, is_platform_admin,
            first_name, last_name, job_title, timezone, locale, last_login_at, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) throw unauthorized();

  let account: {
    role: AppRole;
    status: string;
    companyId: string | null;
    companyName: string | null;
    isPlatformAdmin: boolean;
  };
  let preferences: {
    notifyEmailAssignments: boolean;
    notifyEmailInvoices: boolean;
    notifyEmailBilling: boolean;
  } | null = null;

  if (user.is_platform_admin || auth.role === 'super_admin') {
    account = {
      role: 'super_admin',
      status: 'active',
      companyId: null,
      companyName: null,
      isPlatformAdmin: true,
    };
  } else {
    const { rows: members } = await pool.query(
      `SELECT m.company_id, m.role, m.status, m.notify_email_assignments, m.notify_email_invoices, m.notify_email_billing,
              c.name AS company_name
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = $1 AND m.id = $2 AND c.deleted_at IS NULL`,
      [userId, auth.memberId],
    );
    const member = members[0];
    if (!member) throw unauthorized('No active membership');
    account = {
      role: member.role,
      status: member.status,
      companyId: member.company_id,
      companyName: member.company_name,
      isPlatformAdmin: false,
    };
    preferences = {
      notifyEmailAssignments: member.notify_email_assignments,
      notifyEmailInvoices: member.notify_email_invoices,
      notifyEmailBilling: member.notify_email_billing,
    };
  }

  const worker = auth.role === 'field_worker'
    ? await loadWorkerSnapshot(auth.companyId, auth.memberId)
    : null;

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      name: user.name,
      phone: user.phone || '',
      jobTitle: user.job_title || '',
      timezone: user.timezone || 'America/Chicago',
      locale: user.locale || 'en',
      hasAvatar: Boolean(user.avatar_key),
      avatarUrl: user.avatar_key ? '/api/profile/avatar' : null,
      createdAt: user.created_at ? new Date(user.created_at).toISOString() : null,
      lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
    },
    account,
    preferences,
    worker,
  };
}

profileRouter.get('/', wrap(async (req, res) => {
  res.json(await buildProfile((req as AuthedRequest).auth));
}));

profileRouter.patch('/', wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const userId = auth.userId;
  if (auth.impersonatedBy) throw forbidden('Cannot edit a profile while impersonating');

  const body = z.object({
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional().nullable(),
    jobTitle: z.string().max(120).optional().nullable(),
    timezone: z.string().min(1).max(64).optional(),
    locale: z.enum(['en', 'es']).optional(),
    notifyEmailAssignments: z.boolean().optional(),
    notifyEmailInvoices: z.boolean().optional(),
    notifyEmailBilling: z.boolean().optional(),
  }).parse(req.body);

  if (body.email) {
    const taken = await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [body.email, userId]);
    if (taken.rowCount) throw conflict('Email already in use');
  }

  await withTransaction(async (client) => {
    const current = (await client.query(
      `SELECT name, first_name, last_name FROM users WHERE id = $1`,
      [userId],
    )).rows[0];
    const firstName = body.firstName ?? current.first_name;
    const lastName = body.lastName ?? current.last_name;
    const display = (body.name?.trim())
      || [firstName, lastName].filter(Boolean).join(' ').trim()
      || current.name;

    await client.query(
      `UPDATE users SET
         first_name = coalesce($2, first_name),
         last_name = coalesce($3, last_name),
         name = $4,
         email = coalesce($5, email),
         phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
         job_title = CASE WHEN $8::boolean THEN $9 ELSE job_title END,
         timezone = coalesce($10, timezone),
         locale = coalesce($11, locale)
       WHERE id = $1`,
      [
        userId,
        body.firstName ?? null,
        body.lastName ?? null,
        display,
        body.email ?? null,
        body.phone !== undefined,
        body.phone ?? null,
        body.jobTitle !== undefined,
        body.jobTitle ?? null,
        body.timezone ?? null,
        body.locale ?? null,
      ],
    );

    const prefTouched = body.notifyEmailAssignments !== undefined
      || body.notifyEmailInvoices !== undefined
      || body.notifyEmailBilling !== undefined;
    if (prefTouched) {
      if (!auth.memberId || !auth.companyId) throw forbidden('Tenant membership required');
      await client.query(
        `UPDATE company_members SET
           notify_email_assignments = coalesce($4, notify_email_assignments),
           notify_email_invoices = coalesce($5, notify_email_invoices),
           notify_email_billing = coalesce($6, notify_email_billing)
         WHERE id = $1 AND company_id = $2 AND user_id = $3`,
        [
          auth.memberId,
          auth.companyId,
          userId,
          body.notifyEmailAssignments ?? null,
          body.notifyEmailInvoices ?? null,
          body.notifyEmailBilling ?? null,
        ],
      );
    }

    await audit(client, {
      actorUserId: userId,
      companyId: auth.companyId,
      action: 'profile.updated',
      entityType: 'user',
      entityId: userId,
      ip: req.ip,
      metadata: { fields: Object.keys(body) },
    });
  });

  res.json(await buildProfile(auth));
}));

profileRouter.post('/change-password', wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (auth.impersonatedBy) throw forbidden('Cannot change a password while impersonating');
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
  }).parse(req.body);

  const { rows } = await pool.query(`SELECT id, password_hash FROM users WHERE id = $1`, [auth.userId]);
  const row = rows[0];
  if (!row || !(await verifyPassword(row.password_hash, body.currentPassword))) {
    throw unauthorized('Current password is incorrect');
  }
  if (body.currentPassword === body.newPassword) {
    throw badRequest('New password must be different from the current password');
  }

  const passwordHash = await hashPassword(body.newPassword);
  const accessToken = signAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    role: auth.role,
    memberId: auth.memberId,
  });
  const refreshToken = signRefresh(auth.userId);

  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, auth.userId]);
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [auth.userId],
    );
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '14 days')`,
      [auth.userId, sha256(refreshToken)],
    );
    await audit(client, {
      actorUserId: auth.userId,
      companyId: auth.companyId,
      action: 'profile.password_changed',
      entityType: 'user',
      entityId: auth.userId,
      ip: req.ip,
    });
  });

  res.json({ ok: true, accessToken, refreshToken });
}));

profileRouter.get('/avatar', wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const { rows } = await pool.query(`SELECT avatar_key FROM users WHERE id = $1`, [auth.userId]);
  const key = rows[0]?.avatar_key as string | undefined;
  if (!key) throw notFound('Avatar');
  const full = avatarAbsPath(key);
  if (!fs.existsSync(full)) throw notFound('Avatar');
  res.sendFile(full);
}));

profileRouter.post('/avatar', avatarUpload.single('file'), wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (auth.impersonatedBy) throw forbidden('Cannot change an avatar while impersonating');
  if (!req.file) throw badRequest('file is required');
  if (!AVATAR_TYPES.has(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    throw badRequest('Image must be JPEG, PNG, WebP, or GIF');
  }

  const destDir = path.join(avatarDir, auth.userId);
  fs.mkdirSync(destDir, { recursive: true });
  const ext = req.file.mimetype === 'image/png' ? '.png'
    : req.file.mimetype === 'image/webp' ? '.webp'
      : req.file.mimetype === 'image/gif' ? '.gif'
        : '.jpg';
  const filename = `${Date.now()}${ext}`;
  const dest = path.join(destDir, filename);
  fs.renameSync(req.file.path, dest);
  const storageKey = path.posix.join('avatars', auth.userId, filename);

  await withTransaction(async (client) => {
    const prev = (await client.query(`SELECT avatar_key FROM users WHERE id = $1`, [auth.userId])).rows[0];
    await client.query(
      `UPDATE users SET avatar_key = $2, avatar_url = $3 WHERE id = $1`,
      [auth.userId, storageKey, '/api/profile/avatar'],
    );
    removeAvatarFile(prev?.avatar_key);
    await audit(client, {
      actorUserId: auth.userId,
      companyId: auth.companyId,
      action: 'profile.avatar_changed',
      entityType: 'user',
      entityId: auth.userId,
      ip: req.ip,
      metadata: { action: 'upload' },
    });
  });

  res.status(201).json(await buildProfile(auth));
}));

profileRouter.delete('/avatar', wrap(async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (auth.impersonatedBy) throw forbidden('Cannot change an avatar while impersonating');
  await withTransaction(async (client) => {
    const prev = (await client.query(`SELECT avatar_key FROM users WHERE id = $1`, [auth.userId])).rows[0];
    await client.query(`UPDATE users SET avatar_key = NULL, avatar_url = NULL WHERE id = $1`, [auth.userId]);
    removeAvatarFile(prev?.avatar_key);
    await audit(client, {
      actorUserId: auth.userId,
      companyId: auth.companyId,
      action: 'profile.avatar_changed',
      entityType: 'user',
      entityId: auth.userId,
      ip: req.ip,
      metadata: { action: 'remove' },
    });
  });
  res.json(await buildProfile(auth));
}));
