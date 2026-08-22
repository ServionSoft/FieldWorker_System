import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound } from '../../utils/errors.js';
import { parsePage, pageResult } from '../../utils/helpers.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

function map(n: Record<string, unknown>) {
  const created = n.created_at as Date;
  return {
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    timestamp: created.toISOString(),
    eventKey: n.event_key ?? null,
    linkPath: n.link_path ?? null,
    entityType: n.entity_type ?? null,
    entityId: n.entity_id ?? null,
  };
}

notificationsRouter.get('/', tenantRoute(async (req, res, client) => {
  const { rows } = await client.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.auth.userId],
  );
  const { page, pageSize } = parsePage({ ...req.query, pageSize: req.query.pageSize ?? 100 });
  res.json(pageResult(rows.map(map), page, pageSize));
}));

notificationsRouter.post('/:id/read', tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.auth.userId],
  );
  if (!r.rowCount) throw notFound('Notification');
  res.json({ ok: true });
}));

notificationsRouter.post('/read-all', tenantRoute(async (req, res, client) => {
  await client.query(`UPDATE notifications SET read = true WHERE user_id = $1`, [req.auth.userId]);
  res.json({ ok: true });
}));
