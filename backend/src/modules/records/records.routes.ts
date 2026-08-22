import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest } from '../../utils/errors.js';

const entityType = z.enum(['customer', 'job', 'estimate', 'invoice']);

export const recordsRouter = Router();
recordsRouter.use(
  requireAuth,
  requireTenant,
  requireRole('admin'),
  requirePermission('customers.read', 'jobs.read', 'estimates.read', 'invoices.read'),
);

recordsRouter.get('/people', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT u.id, u.name, m.role
     FROM company_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.status = 'active'
     ORDER BY u.name`,
    [req.auth.companyId],
  );
  res.json({ items: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })) });
}));

recordsRouter.get('/favorites', tenantRoute(async (req, res, client) => {
  const entity = String(req.query.entityType ?? '');
  const { rows } = await client.query(
    `SELECT entity_type, entity_id, starred, pinned
     FROM record_favorites
     WHERE company_id = $1 AND user_id = $2
       AND ($3 = '' OR entity_type = $3)`,
    [req.auth.companyId, req.auth.userId, entity],
  );
  res.json({
    items: rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      starred: r.starred,
      pinned: r.pinned,
    })),
  });
}));

recordsRouter.put('/favorites', tenantRoute(async (req, res, client) => {
  const body = z.object({
    entityType,
    entityId: z.string().uuid(),
    starred: z.boolean().optional(),
    pinned: z.boolean().optional(),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const existing = await client.query(
    `SELECT starred, pinned FROM record_favorites
     WHERE company_id = $1 AND user_id = $2 AND entity_type = $3 AND entity_id = $4`,
    [companyId, req.auth.userId, body.entityType, body.entityId],
  );
  const starred = body.starred ?? existing.rows[0]?.starred ?? false;
  const pinned = body.pinned ?? existing.rows[0]?.pinned ?? false;
  if (!starred && !pinned) {
    await client.query(
      `DELETE FROM record_favorites
       WHERE company_id = $1 AND user_id = $2 AND entity_type = $3 AND entity_id = $4`,
      [companyId, req.auth.userId, body.entityType, body.entityId],
    );
    res.json({ entityType: body.entityType, entityId: body.entityId, starred: false, pinned: false });
    return;
  }
  await client.query(
    `INSERT INTO record_favorites (company_id, user_id, entity_type, entity_id, starred, pinned)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, entity_type, entity_id)
     DO UPDATE SET starred = EXCLUDED.starred, pinned = EXCLUDED.pinned, company_id = EXCLUDED.company_id`,
    [companyId, req.auth.userId, body.entityType, body.entityId, starred, pinned],
  );
  res.json({ entityType: body.entityType, entityId: body.entityId, starred, pinned });
}));

recordsRouter.get('/views', tenantRoute(async (req, res, client) => {
  const page = String(req.query.page ?? '');
  if (!page) throw badRequest('page is required');
  const { rows } = await client.query(
    `SELECT id, page, name, filters, created_at
     FROM saved_views
     WHERE company_id = $1 AND user_id = $2 AND page = $3
     ORDER BY created_at DESC`,
    [req.auth.companyId, req.auth.userId, page],
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      page: r.page,
      name: r.name,
      filters: r.filters,
      createdAt: r.created_at.toISOString(),
    })),
  });
}));

recordsRouter.post('/views', tenantRoute(async (req, res, client) => {
  const body = z.object({
    page: z.string().min(1).max(40),
    name: z.string().min(1).max(80),
    filters: z.record(z.unknown()).default({}),
  }).parse(req.body);
  const created = await client.query(
    `INSERT INTO saved_views (company_id, user_id, page, name, filters)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, page, name, filters, created_at`,
    [req.auth.companyId, req.auth.userId, body.page, body.name, JSON.stringify(body.filters)],
  );
  const r = created.rows[0];
  res.status(201).json({
    id: r.id, page: r.page, name: r.name, filters: r.filters, createdAt: r.created_at.toISOString(),
  });
}));

recordsRouter.delete('/views/:id', tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `DELETE FROM saved_views WHERE company_id = $1 AND user_id = $2 AND id = $3 RETURNING id`,
    [req.auth.companyId, req.auth.userId, req.params.id],
  );
  if (!r.rowCount) throw notFound('Saved view');
  res.json({ ok: true });
}));
