import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound } from '../../utils/errors.js';
import { parsePage, pageResult } from '../../utils/helpers.js';

export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('templates.manage'));

function map(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    body: r.body,
    companyId: r.company_id,
    type: r.type,
  };
}

templatesRouter.get('/', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(`SELECT * FROM email_templates WHERE company_id = $1`, [req.auth.companyId]);
  const { page, pageSize } = parsePage(req.query);
  res.json(pageResult(rows.map(map), page, pageSize));
}));

templatesRouter.post('/', tenantRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().optional().default(''),
    type: z.enum(['invoice', 'appointment', 'follow_up', 'estimate', 'customer_communication']),
  }).parse(req.body);
  const created = await client.query(
    `INSERT INTO email_templates (company_id, name, subject, body, type) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.auth.companyId, body.name, body.subject, body.body, body.type],
  );
  res.status(201).json(map(created.rows[0]));
}));

templatesRouter.patch('/:id', tenantRoute(async (req, res, client) => {
  const body = z.object({
    name: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    type: z.enum(['invoice', 'appointment', 'follow_up', 'estimate', 'customer_communication']).optional(),
  }).parse(req.body);
  const r = await client.query(
    `UPDATE email_templates SET
       name = coalesce($3, name), subject = coalesce($4, subject), body = coalesce($5, body), type = coalesce($6, type)
     WHERE company_id = $1 AND id = $2 RETURNING *`,
    [req.auth.companyId, req.params.id, body.name ?? null, body.subject ?? null, body.body ?? null, body.type ?? null],
  );
  if (!r.rowCount) throw notFound('Template');
  res.json(map(r.rows[0]));
}));

templatesRouter.delete('/:id', tenantRoute(async (req, res, client) => {
  const r = await client.query(`DELETE FROM email_templates WHERE company_id = $1 AND id = $2 RETURNING id`, [req.auth.companyId, req.params.id]);
  if (!r.rowCount) throw notFound('Template');
  res.json({ ok: true });
}));
