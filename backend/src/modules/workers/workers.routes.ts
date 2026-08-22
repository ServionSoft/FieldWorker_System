import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, conflict } from '../../utils/errors.js';
import { hashPassword } from '../../utils/crypto.js';
import { assertPlanLimits, notify, parsePage, pageResult } from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';

export const workersRouter = Router();
workersRouter.use(requireAuth, requireTenant);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function availFromRows(rows: { weekday: number; start_time: string | null; end_time: string | null }[]) {
  const map: Record<string, { start: string; end: string } | null> = {};
  DAYS.forEach((d, i) => {
    const row = rows.find((r) => r.weekday === i);
    map[d] = row?.start_time && row?.end_time
      ? { start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5) }
      : null;
  });
  return map as Record<(typeof DAYS)[number], { start: string; end: string } | null>;
}

async function mapWorker(client: import('pg').PoolClient, companyId: string, profileId: string) {
  const { rows } = await client.query(
    `SELECT wp.*, m.user_id, m.status AS member_status, u.name, u.email, u.phone, u.avatar_url
     FROM worker_profiles wp
     JOIN company_members m ON m.id = wp.member_id
     JOIN users u ON u.id = m.user_id
     WHERE wp.company_id = $1 AND wp.id = $2`,
    [companyId, profileId],
  );
  const w = rows[0];
  if (!w) return null;
  const specs = (await client.query(
    `SELECT name FROM worker_specialties WHERE worker_profile_id = $1`,
    [profileId],
  )).rows.map((r: { name: string }) => r.name);
  const avail = (await client.query(
    `SELECT weekday, start_time, end_time FROM worker_availability WHERE worker_profile_id = $1`,
    [profileId],
  )).rows;
  const off = (await client.query(
    `SELECT off_date FROM worker_time_off WHERE worker_profile_id = $1 ORDER BY off_date`,
    [profileId],
  )).rows.map((r: { off_date: Date }) => r.off_date.toISOString().slice(0, 10));
  return {
    id: w.user_id,
    profileId: w.id,
    memberId: w.member_id,
    name: w.name,
    email: w.email,
    phone: w.phone ?? '',
    companyId: w.company_id,
    specialties: specs,
    status: w.employment_status,
    avatar: w.avatar_url,
    rating: Number(w.rating),
    jobsCompleted: w.jobs_completed,
    availability: availFromRows(avail),
    unavailableDates: off,
  };
}

async function findProfileIdByUser(client: import('pg').PoolClient, companyId: string, userId: string) {
  const { rows } = await client.query(
    `SELECT wp.id FROM worker_profiles wp
     JOIN company_members m ON m.id = wp.member_id
     WHERE wp.company_id = $1 AND m.user_id = $2`,
    [companyId, userId],
  );
  return rows[0]?.id as string | undefined;
}

workersRouter.get('/', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  if (req.auth.role === 'field_worker') {
    const pid = await findProfileIdByUser(client, companyId, req.auth.userId);
    if (!pid) throw notFound('Worker');
    res.json({ items: [await mapWorker(client, companyId, pid)] });
    return;
  }
  const { rows } = await client.query(`SELECT id FROM worker_profiles WHERE company_id = $1`, [companyId]);
  const items = [];
  for (const r of rows) items.push(await mapWorker(client, companyId, r.id));
  const { page, pageSize } = parsePage(req.query);
  res.json(pageResult(items.filter(Boolean), page, pageSize));
}));

workersRouter.post('/', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().default(''),
    specialties: z.array(z.string()).optional().default([]),
    status: z.enum(['active', 'inactive', 'on_leave']).optional().default('active'),
    password: z.string().min(8).optional(),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [body.email]);
  if (existing.rowCount) {
    const dup = await client.query(
      `SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2`,
      [companyId, existing.rows[0].id],
    );
    if (dup.rowCount) throw conflict('User is already a member of this company');
  }
  await assertPlanLimits(client, companyId, 'workers', { includePendingInvites: true });

  let userId: string;
  if (existing.rowCount) {
    userId = existing.rows[0].id;
  } else {
    const password = body.password ?? 'demo1234';
    const created = await client.query(
      `INSERT INTO users (email, password_hash, name, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [body.email, await hashPassword(password), body.name, body.phone],
    );
    userId = created.rows[0].id;
  }

  const member = await client.query(
    `INSERT INTO company_members (company_id, user_id, role, status) VALUES ($1,$2,'field_worker','active') RETURNING id`,
    [companyId, userId],
  );
  const profile = await client.query(
    `INSERT INTO worker_profiles (company_id, member_id, employment_status) VALUES ($1,$2,$3) RETURNING id`,
    [companyId, member.rows[0].id, body.status],
  );
  for (const s of body.specialties.map((x) => x.trim()).filter(Boolean)) {
    await client.query(
      `INSERT INTO worker_specialties (company_id, worker_profile_id, name) VALUES ($1,$2,$3)`,
      [companyId, profile.rows[0].id, s],
    );
  }
  for (let d = 0; d < 5; d++) {
    await client.query(
      `INSERT INTO worker_availability (company_id, worker_profile_id, weekday, start_time, end_time)
       VALUES ($1,$2,$3,'08:00','17:00')`,
      [companyId, profile.rows[0].id, d],
    );
  }
  await notify(client, {
    companyId, userId, title: 'Welcome to FieldPro',
    message: 'Your worker account is ready. Sign in with your email.',
    eventKey: 'worker.welcome', linkPath: '/worker', type: 'success',
  });
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'worker.create',
    entityType: 'worker', entityId: userId,
  });
  res.status(201).json(await mapWorker(client, companyId, profile.rows[0].id));
}));

workersRouter.get('/:id', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
  if (req.auth.role === 'field_worker' && req.params.id !== req.auth.userId) throw notFound('Worker');
  const pid = await findProfileIdByUser(client, req.auth.companyId!, req.params.id);
  if (!pid) throw notFound('Worker');
  res.json(await mapWorker(client, req.auth.companyId!, pid));
}));

workersRouter.patch('/:id', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    specialties: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'on_leave']).optional(),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const pid = await findProfileIdByUser(client, companyId, req.params.id);
  if (!pid) throw notFound('Worker');
  if (body.name || body.phone !== undefined) {
    await client.query(
      `UPDATE users SET name = coalesce($2, name), phone = coalesce($3, phone) WHERE id = $1`,
      [req.params.id, body.name ?? null, body.phone ?? null],
    );
  }
  if (body.status) {
    const prev = (await client.query(`SELECT employment_status FROM worker_profiles WHERE id = $1`, [pid])).rows[0]?.employment_status;
    const memberRow = await client.query(
      `SELECT status FROM company_members WHERE company_id = $1 AND user_id = $2 AND role = 'field_worker'`,
      [companyId, req.params.id],
    );
    const memberWasActive = memberRow.rows[0]?.status === 'active';
    const activatingSeat = body.status !== 'inactive' && (prev === 'inactive' || !memberWasActive);
    if (activatingSeat) {
      await assertPlanLimits(client, companyId, 'workers', { includePendingInvites: true });
    }
    await client.query(
      `UPDATE worker_profiles SET employment_status = $2 WHERE id = $1`,
      [pid, body.status],
    );
    if (body.status === 'inactive') {
      await client.query(
        `UPDATE company_members SET status = 'inactive' WHERE user_id = $1 AND company_id = $2`,
        [req.params.id, companyId],
      );
    } else {
      await client.query(
        `UPDATE company_members SET status = 'active' WHERE user_id = $1 AND company_id = $2 AND role = 'field_worker'`,
        [req.params.id, companyId],
      );
    }
  }
  if (body.specialties) {
    await client.query(`DELETE FROM worker_specialties WHERE worker_profile_id = $1`, [pid]);
    for (const s of body.specialties) {
      await client.query(
        `INSERT INTO worker_specialties (company_id, worker_profile_id, name) VALUES ($1,$2,$3)`,
        [companyId, pid, s],
      );
    }
  }
  res.json(await mapWorker(client, companyId, pid));
}));

workersRouter.delete('/:id', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const r = await client.query(
    `UPDATE company_members SET status = 'inactive' WHERE company_id = $1 AND user_id = $2 AND role = 'field_worker' RETURNING id`,
    [companyId, req.params.id],
  );
  if (!r.rowCount) throw notFound('Worker');
  await client.query(
    `UPDATE worker_profiles SET employment_status = 'inactive' WHERE member_id = $1`,
    [r.rows[0].id],
  );
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'worker.delete',
    entityType: 'worker', entityId: req.params.id,
  });
  res.json({ ok: true });
}));

workersRouter.put('/:id/availability', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const body = z.record(z.string(), z.object({ start: z.string(), end: z.string() }).nullable()).parse(req.body);
  const companyId = req.auth.companyId!;
  const pid = await findProfileIdByUser(client, companyId, req.params.id);
  if (!pid) throw notFound('Worker');
  await client.query(`DELETE FROM worker_availability WHERE worker_profile_id = $1`, [pid]);
  for (let i = 0; i < DAYS.length; i++) {
    const slot = body[DAYS[i]];
    if (slot) {
      await client.query(
        `INSERT INTO worker_availability (company_id, worker_profile_id, weekday, start_time, end_time)
         VALUES ($1,$2,$3,$4,$5)`,
        [companyId, pid, i, slot.start, slot.end],
      );
    }
  }
  res.json(await mapWorker(client, companyId, pid));
}));

workersRouter.post('/:id/time-off', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const body = z.object({ date: z.string() }).parse(req.body);
  const companyId = req.auth.companyId!;
  const pid = await findProfileIdByUser(client, companyId, req.params.id);
  if (!pid) throw notFound('Worker');
  await client.query(
    `INSERT INTO worker_time_off (company_id, worker_profile_id, off_date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [companyId, pid, body.date],
  );
  res.json(await mapWorker(client, companyId, pid));
}));

workersRouter.delete('/:id/time-off/:date', requireRole('admin'), requirePermission('workers.manage'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const pid = await findProfileIdByUser(client, companyId, req.params.id);
  if (!pid) throw notFound('Worker');
  await client.query(
    `DELETE FROM worker_time_off WHERE worker_profile_id = $1 AND off_date = $2`,
    [pid, req.params.date],
  );
  res.json(await mapWorker(client, companyId, pid));
}));
