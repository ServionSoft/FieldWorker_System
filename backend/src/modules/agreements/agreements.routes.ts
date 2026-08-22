import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound } from '../../utils/errors.js';
import { parsePage, pageResult } from '../../utils/helpers.js';

export const agreementsRouter = Router();
agreementsRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('agreements.access'));

async function map(client: import('pg').PoolClient, companyId: string, id: string) {
  const { rows } = await client.query(
    `SELECT sa.*, cc.first_name, cc.last_name
     FROM service_agreements sa
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = sa.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE sa.company_id = $1 AND sa.id = $2`,
    [companyId, id],
  );
  const a = rows[0];
  if (!a) return null;
  return {
    id: a.id,
    title: a.title,
    customerId: a.customer_id,
    customerName: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(),
    companyId: a.company_id,
    jobId: a.job_id,
    status: a.status,
    startDate: a.start_date ? a.start_date.toISOString().slice(0, 10) : '',
    endDate: a.end_date ? a.end_date.toISOString().slice(0, 10) : '',
    terms: a.terms,
  };
}

agreementsRouter.get('/', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(`SELECT id FROM service_agreements WHERE company_id = $1 ORDER BY start_date DESC NULLS LAST`, [req.auth.companyId]);
  const items = [];
  for (const r of rows) items.push(await map(client, req.auth.companyId!, r.id));
  const { page, pageSize } = parsePage(req.query);
  res.json(pageResult(items.filter(Boolean), page, pageSize));
}));

agreementsRouter.post('/', tenantRoute(async (req, res, client) => {
  const body = z.object({
    title: z.string().min(1),
    customerId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    terms: z.string().optional().default(''),
  }).parse(req.body);
  const cust = await client.query(`SELECT id FROM customers WHERE company_id = $1 AND id = $2`, [req.auth.companyId, body.customerId]);
  if (!cust.rowCount) throw notFound('Customer');
  const created = await client.query(
    `INSERT INTO service_agreements (company_id, customer_id, job_id, title, terms, status, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,'draft',$6,$7) RETURNING id`,
    [req.auth.companyId, body.customerId, body.jobId ?? null, body.title, body.terms, body.startDate || null, body.endDate || null],
  );
  res.status(201).json(await map(client, req.auth.companyId!, created.rows[0].id));
}));

agreementsRouter.get('/:id', tenantRoute(async (req, res, client) => {
  const a = await map(client, req.auth.companyId!, req.params.id);
  if (!a) throw notFound('Agreement');
  res.json(a);
}));

agreementsRouter.patch('/:id', tenantRoute(async (req, res, client) => {
  const body = z.object({
    status: z.enum(['draft', 'active', 'expired']).optional(),
    title: z.string().optional(),
    terms: z.string().optional(),
  }).parse(req.body);
  const r = await client.query(
    `UPDATE service_agreements SET
       status = coalesce($3, status), title = coalesce($4, title), terms = coalesce($5, terms)
     WHERE company_id = $1 AND id = $2 RETURNING id`,
    [req.auth.companyId, req.params.id, body.status ?? null, body.title ?? null, body.terms ?? null],
  );
  if (!r.rowCount) throw notFound('Agreement');
  res.json(await map(client, req.auth.companyId!, req.params.id));
}));
