import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { hashPassword, randomToken, sha256 } from '../../utils/crypto.js';
import { notify, notifyByPermission } from '../../utils/helpers.js';
import { assertWorkerLimitSynced } from '../billing/stripe-sync.js';
import { sendPlatformEmail } from '../../services/email.js';
import {
  PERMISSIONS, PERMISSION_LABELS, ROLE_DEFAULTS, effectivePermissions, type Permission,
} from '../rbac/permissions.js';
import type { AppRole } from '../../types.js';
import { wrap } from '../../utils/async.js';
import { pool, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';

const memberRole = z.enum(['owner', 'admin', 'dispatcher', 'office', 'field_worker']);

export const membersRouter = Router();
membersRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('settings.users'));

async function mapMember(client: import('pg').PoolClient, companyId: string, memberId: string) {
  const { rows } = await client.query(
    `SELECT m.id, m.role, m.status, m.created_at, m.notify_email_assignments, m.notify_email_invoices, m.notify_email_billing,
            u.id AS user_id, u.name, u.email, u.phone, u.avatar_url
     FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.id = $2`,
    [companyId, memberId],
  );
  const m = rows[0];
  if (!m) return null;
  const overrides = (await client.query(
    `SELECT permission, allowed FROM company_member_permissions WHERE member_id = $1`,
    [memberId],
  )).rows;
  const permissions = effectivePermissions(m.role as AppRole, overrides);
  return {
    id: m.id,
    userId: m.user_id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    avatar: m.avatar_url,
    role: m.role,
    status: m.status,
    createdAt: m.created_at.toISOString(),
    permissions,
    overrides,
    notifyEmailAssignments: m.notify_email_assignments,
    notifyEmailInvoices: m.notify_email_invoices,
    notifyEmailBilling: m.notify_email_billing,
  };
}

membersRouter.get('/', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT id FROM company_members WHERE company_id = $1 ORDER BY created_at`,
    [req.auth.companyId],
  );
  const items = [];
  for (const r of rows) items.push(await mapMember(client, req.auth.companyId!, r.id));
  res.json({ items: items.filter(Boolean), permissionCatalog: PERMISSIONS.map((p) => ({ key: p, label: PERMISSION_LABELS[p] })) });
}));

membersRouter.get('/invitations', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT id, email, name, role, expires_at, accepted_at, created_at
     FROM invitations WHERE company_id = $1 ORDER BY created_at DESC`,
    [req.auth.companyId],
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      expiresAt: r.expires_at.toISOString(),
      acceptedAt: r.accepted_at ? r.accepted_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      status: r.accepted_at ? 'accepted' : (r.expires_at < new Date() ? 'expired' : 'pending'),
    })),
  });
}));

membersRouter.post('/invite', tenantRoute(async (req, res, client) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: memberRole.default('office'),
  }).parse(req.body);
  if (body.role === 'owner' && req.auth.role !== 'owner') throw forbidden('Only an owner can invite another owner');
  const companyId = req.auth.companyId!;
  if (body.role === 'field_worker') {
    await assertWorkerLimitSynced(client, companyId, { includePendingInvites: true });
  }
  const existing = await client.query(
    `SELECT 1 FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND u.email = $2`,
    [companyId, body.email],
  );
  if (existing.rowCount) throw conflict('User is already a member');
  const token = randomToken();
  const created = await client.query(
    `INSERT INTO invitations (company_id, email, name, role, token_hash, invited_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days') RETURNING *`,
    [companyId, body.email, body.name ?? null, body.role, sha256(token), req.auth.userId],
  );
  const base = env.APP_PUBLIC_URL || env.CORS_ORIGIN;
  const link = `${base.replace(/\/$/, '')}/invite/${token}`;
  const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  await sendPlatformEmail({
    to: body.email,
    templateType: 'tenant_invitation',
    vars: {
      companyName: company.rows[0]?.name || 'FieldPro',
      role: body.role,
      inviteLink: link,
    },
  });
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'member.invite',
    entityType: 'invitation', entityId: created.rows[0].id, metadata: { email: body.email, role: body.role },
  });
  res.status(201).json({
    id: created.rows[0].id,
    email: body.email,
    role: body.role,
    inviteUrl: process.env.NODE_ENV !== 'production' ? link : undefined,
  });
}));

membersRouter.patch('/:id', tenantRoute(async (req, res, client) => {
  const body = z.object({
    role: memberRole.optional(),
    status: z.enum(['active', 'inactive']).optional(),
    permissions: z.array(z.object({
      permission: z.enum(PERMISSIONS as unknown as [Permission, ...Permission[]]),
      allowed: z.boolean(),
    })).optional(),
    notifyEmailAssignments: z.boolean().optional(),
    notifyEmailInvoices: z.boolean().optional(),
    notifyEmailBilling: z.boolean().optional(),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const current = await mapMember(client, companyId, req.params.id);
  if (!current) throw notFound('Member');
  if (current.role === 'owner' && body.role && body.role !== 'owner') {
    const owners = await client.query(
      `SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'owner' AND status = 'active'`,
      [companyId],
    );
    if (owners.rows[0].n <= 1) throw badRequest('Cannot demote the last owner');
  }
  if (current.role === 'owner' && body.status === 'inactive') {
    const owners = await client.query(
      `SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'owner' AND status = 'active'`,
      [companyId],
    );
    if (owners.rows[0].n <= 1) throw badRequest('Cannot deactivate the last owner');
  }
  if (body.role === 'owner' && req.auth.role !== 'owner') throw forbidden('Only an owner can assign owner');
  const nextRole = body.role ?? current.role;
  const nextStatus = body.status ?? current.status;
  const becomingWorker = nextRole === 'field_worker' && (current.role !== 'field_worker' || current.status !== 'active');
  if (becomingWorker && nextStatus === 'active') {
    await assertWorkerLimitSynced(client, companyId, { includePendingInvites: true });
  }
  await client.query(
    `UPDATE company_members SET
       role = coalesce($3, role),
       status = coalesce($4, status),
       notify_email_assignments = coalesce($5, notify_email_assignments),
       notify_email_invoices = coalesce($6, notify_email_invoices),
       notify_email_billing = coalesce($7, notify_email_billing)
     WHERE company_id = $1 AND id = $2`,
    [
      companyId, req.params.id, body.role ?? null, body.status ?? null,
      body.notifyEmailAssignments ?? null, body.notifyEmailInvoices ?? null, body.notifyEmailBilling ?? null,
    ],
  );
  if (nextRole === 'field_worker') {
    await client.query(
      `INSERT INTO worker_profiles (company_id, member_id, employment_status)
       VALUES ($1,$2,'active')
       ON CONFLICT (member_id) DO UPDATE SET
         employment_status = CASE WHEN $3 = 'active' THEN 'active' ELSE worker_profiles.employment_status END`,
      [companyId, req.params.id, nextStatus],
    );
  }
  if (body.permissions) {
    await client.query(`DELETE FROM company_member_permissions WHERE member_id = $1`, [req.params.id]);
    const role = (body.role ?? current.role) as AppRole;
    const defaults = new Set(ROLE_DEFAULTS[role as Exclude<AppRole, 'super_admin'>] ?? []);
    for (const p of body.permissions) {
      const isDefault = defaults.has(p.permission);
      if (p.allowed === isDefault) continue;
      await client.query(
        `INSERT INTO company_member_permissions (company_id, member_id, permission, allowed) VALUES ($1,$2,$3,$4)`,
        [companyId, req.params.id, p.permission, p.allowed],
      );
    }
  }
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'member.update',
    entityType: 'member', entityId: req.params.id,
  });
  res.json(await mapMember(client, companyId, req.params.id));
}));

membersRouter.delete('/:id', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const current = await mapMember(client, companyId, req.params.id);
  if (!current) throw notFound('Member');
  if (current.userId === req.auth.userId) throw badRequest('Cannot remove yourself');
  if (current.role === 'owner') {
    const owners = await client.query(
      `SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'owner' AND status = 'active'`,
      [companyId],
    );
    if (owners.rows[0].n <= 1) throw badRequest('Cannot remove the last owner');
  }
  await client.query(`UPDATE company_members SET status = 'inactive' WHERE company_id = $1 AND id = $2`, [companyId, req.params.id]);
  res.json({ ok: true });
}));

export const invitePublicRouter = Router();

invitePublicRouter.get('/:token', wrap(async (req, res) => {
  const preview = await withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.is_super_admin', 'true', true)`);
    const { rows } = await client.query(
      `SELECT i.email, i.name, i.role, i.expires_at, i.accepted_at, c.name AS company_name
       FROM invitations i JOIN companies c ON c.id = i.company_id
       WHERE i.token_hash = $1`,
      [sha256(req.params.token)],
    );
    if (!rows[0] || rows[0].accepted_at || rows[0].expires_at < new Date()) {
      throw badRequest('Invalid or expired invitation');
    }
    return {
      email: rows[0].email,
      name: rows[0].name,
      role: rows[0].role,
      companyName: rows[0].company_name,
    };
  });
  res.json(preview);
}));

invitePublicRouter.post('/:token/accept', wrap(async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    password: z.string().min(8),
  }).parse(req.body);
  const accepted = await withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.is_super_admin', 'true', true)`);
    const { rows } = await client.query(
      `SELECT * FROM invitations WHERE token_hash = $1 FOR UPDATE`,
      [sha256(req.params.token)],
    );
    const inv = rows[0];
    if (!inv || inv.accepted_at || inv.expires_at < new Date()) throw badRequest('Invalid or expired invitation');
    let userId: string;
    const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [inv.email]);
    if (existing.rowCount) {
      userId = existing.rows[0].id;
      await client.query(`UPDATE users SET password_hash = $2, name = coalesce(name, $3) WHERE id = $1`, [
        userId, await hashPassword(body.password), body.name,
      ]);
    } else {
      const created = await client.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
        [inv.email, await hashPassword(body.password), body.name],
      );
      userId = created.rows[0].id;
    }
    const dup = await client.query(
      `SELECT id FROM company_members WHERE company_id = $1 AND user_id = $2`,
      [inv.company_id, userId],
    );
    if (dup.rowCount) throw conflict('Already a member');
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [inv.company_id]);
    if (inv.role === 'field_worker') {
      await assertWorkerLimitSynced(client, inv.company_id);
    }
    const member = await client.query(
      `INSERT INTO company_members (company_id, user_id, role, status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [inv.company_id, userId, inv.role],
    );
    if (inv.role === 'field_worker') {
      await client.query(
        `INSERT INTO worker_profiles (company_id, member_id, employment_status) VALUES ($1,$2,'active')`,
        [inv.company_id, member.rows[0].id],
      );
    }
    await client.query(`UPDATE invitations SET accepted_at = now() WHERE id = $1`, [inv.id]);
    await notify(client, {
      companyId: inv.company_id,
      userId,
      title: 'Welcome to FieldPro',
      message: 'Your account is ready.',
      type: 'success',
      eventKey: 'member.welcome',
      linkPath: inv.role === 'field_worker' ? '/worker' : '/admin',
    });
    await notifyByPermission(client, inv.company_id, 'settings.users', {
      title: 'Team member joined',
      message: `${body.name} accepted their invitation`,
      eventKey: 'member.joined',
      linkPath: '/admin/settings?tab=users',
    });
    return { ok: true as const, role: inv.role as string };
  });
  res.json(accepted);
}));
