import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { notify } from '../../utils/helpers.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { customerEmailFor, sendTenantCrmEmail } from '../../services/tenantCrmEmail.js';

export const followUpsRouter = Router();
followUpsRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('customers.read'));

function map(r: Record<string, unknown>, customerName?: string) {
  const due = r.due_date as Date | null;
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: customerName ?? null,
    estimateId: r.estimate_id,
    jobId: r.job_id,
    title: r.title,
    dueDate: due ? due.toISOString().slice(0, 10) : null,
    done: r.done,
    assignedUserId: r.assigned_user_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

async function assertCompanyUser(client: import('pg').PoolClient, companyId: string, userId: string) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2 AND status = 'active'`,
    [companyId, userId],
  );
  return (rowCount ?? 0) > 0;
}

followUpsRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const customerId = (req.query.customerId as string) || null;
  const overdue = String(req.query.overdue ?? '') === 'true';
  const dueToday = String(req.query.dueToday ?? '') === 'true';
  const upcoming = String(req.query.upcoming ?? '') === 'true';
  const mine = String(req.query.mine ?? '') === 'true';
  const done = req.query.done === undefined ? null : String(req.query.done) === 'true';
  const { rows } = await client.query(
    `SELECT f.*, coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS customer_name
     FROM follow_ups f
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = f.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE f.company_id = $1
       AND ($2::uuid IS NULL OR f.customer_id = $2)
       AND ($3::boolean IS NULL OR f.done = $3)
       AND ($4::boolean IS NOT TRUE OR (f.done = false AND f.due_date IS NOT NULL AND f.due_date < current_date))
       AND ($5::boolean IS NOT TRUE OR (f.done = false AND f.due_date = current_date))
       AND ($6::boolean IS NOT TRUE OR (f.done = false AND f.due_date IS NOT NULL AND f.due_date > current_date))
       AND ($7::boolean IS NOT TRUE OR f.assigned_user_id = $8)
     ORDER BY f.done ASC, f.due_date NULLS LAST, f.created_at DESC`,
    [companyId, customerId, done, overdue, dueToday, upcoming, mine, req.auth.userId],
  );
  res.json({ items: rows.map((r) => map(r, r.customer_name)) });
}));

followUpsRouter.post('/', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    customerId: z.string().uuid(),
    title: z.string().min(1),
    dueDate: z.string().optional(),
    estimateId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
  }).parse(req.body);
  const cust = await client.query(`SELECT id FROM customers WHERE company_id = $1 AND id = $2`, [req.auth.companyId, body.customerId]);
  if (!cust.rowCount) throw notFound('Customer');
  let assigned = body.assignedUserId ?? null;
  if (assigned && !(await assertCompanyUser(client, req.auth.companyId!, assigned))) {
    assigned = null;
  }
  const created = await client.query(
    `INSERT INTO follow_ups (company_id, customer_id, title, due_date, estimate_id, job_id, assigned_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.auth.companyId, body.customerId, body.title, body.dueDate || null, body.estimateId ?? null, body.jobId ?? null, assigned],
  );
  await audit(client, {
    actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'follow_up.create',
    entityType: 'customer', entityId: body.customerId,
  });
  const notifyUserId = assigned || req.auth.userId;
  if (body.dueDate || assigned) {
    await notify(client, {
      companyId: req.auth.companyId!,
      userId: notifyUserId,
      title: assigned && assigned !== req.auth.userId ? 'Follow-up assigned' : 'Follow-up scheduled',
      message: `${body.title}${body.dueDate ? ` due ${body.dueDate}` : ''}`,
      eventKey: assigned ? 'followup.assigned' : 'followup.created',
      entityType: 'customer',
      entityId: body.customerId,
      linkPath: `/admin/customers/${body.customerId}`,
    });
  }
  const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [req.auth.companyId]);
  const custMail = await customerEmailFor(client, req.auth.companyId!, body.customerId);
  if (custMail) {
    await sendTenantCrmEmail(client, {
      companyId: req.auth.companyId!,
      type: 'follow_up',
      to: custMail.email,
      customerId: body.customerId,
      jobId: body.jobId,
      estimateId: body.estimateId,
      userId: req.auth.userId,
      vars: {
        customerName: custMail.name,
        companyName: company.rows[0]?.name ?? '',
        title: body.title,
        dueDate: body.dueDate || '',
      },
      fallbackSubject: body.title,
      fallbackBody: `Dear ${custMail.name},\n\n${body.title}${body.dueDate ? `\nDue: ${body.dueDate}` : ''}`,
    });
  }
  res.status(201).json(map(created.rows[0]));
}));

followUpsRouter.patch('/:id', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    title: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    done: z.boolean().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
  }).parse(req.body);
  let assignedId: string | null | undefined = body.assignedUserId;
  if (assignedId && !(await assertCompanyUser(client, req.auth.companyId!, assignedId))) {
    assignedId = undefined;
  }
  const existing = await client.query(
    `SELECT * FROM follow_ups WHERE company_id = $1 AND id = $2`,
    [req.auth.companyId, req.params.id],
  );
  if (!existing.rowCount) throw notFound('Follow-up');
  const r = await client.query(
    `UPDATE follow_ups SET
       title = coalesce($3, title),
       due_date = CASE WHEN $4::boolean THEN due_date ELSE $5::date END,
       done = coalesce($6, done),
       assigned_user_id = CASE WHEN $7::boolean THEN assigned_user_id ELSE $8::uuid END
     WHERE company_id = $1 AND id = $2 RETURNING *`,
    [
      req.auth.companyId, req.params.id,
      body.title ?? null,
      body.dueDate === undefined,
      body.dueDate ?? null,
      body.done ?? null,
      assignedId === undefined,
      assignedId ?? null,
    ],
  );
  if (body.done === true && !existing.rows[0].done) {
    await audit(client, {
      actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'follow_up.complete',
      entityType: 'customer', entityId: r.rows[0].customer_id,
    });
  }
  res.json(map(r.rows[0]));
}));

followUpsRouter.delete('/:id', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `DELETE FROM follow_ups WHERE company_id = $1 AND id = $2 RETURNING id`,
    [req.auth.companyId, req.params.id],
  );
  if (!r.rowCount) throw notFound('Follow-up');
  res.json({ ok: true });
}));
