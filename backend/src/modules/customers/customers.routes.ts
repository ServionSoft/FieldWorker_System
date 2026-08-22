import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest, conflict } from '../../utils/errors.js';
import { formatAddress, parsePage, pageResult } from '../../utils/helpers.js';
import { last10 } from '../../utils/phone.js';
import { audit } from '../../utils/audit.js';
import { customerNestedRouter } from './customers.nested.js';

export const customersRouter = Router();
customersRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('customers.read'));

const createSchema = z.object({
  firstName: z.string().optional().default(''),
  lastName: z.string().optional().default(''),
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')).optional(),
  phone: z.string().optional().default(''),
  phoneExt: z.string().optional(),
  notes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(['active', 'inactive', 'lead']).optional().default('active'),
  customerType: z.enum(['residential', 'commercial']).optional(),
  source: z.string().optional(),
  locationName: z.string().optional(),
  street: z.string().optional().default(''),
  unit: z.string().optional(),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  gatedProperty: z.boolean().optional().default(false),
  paymentTerms: z.string().optional(),
  taxExempt: z.boolean().optional(),
  parentCustomerId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});

async function mapCustomer(client: import('pg').PoolClient, companyId: string, id: string, userId?: string) {
  const { rows } = await client.query(
    `SELECT c.*,
       (SELECT count(*)::int FROM jobs j WHERE j.customer_id = c.id AND j.archived_at IS NULL) AS total_jobs,
       (SELECT coalesce(sum(i.total),0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'paid') AS total_spent,
       ou.name AS owner_name,
       cu.name AS created_by_name,
       uu.name AS updated_by_name,
       au.name AS archived_by_name,
       coalesce(rf.starred, false) AS is_starred,
       coalesce(rf.pinned, false) AS is_pinned
     FROM customers c
     LEFT JOIN users ou ON ou.id = c.owner_user_id
     LEFT JOIN users cu ON cu.id = c.created_by
     LEFT JOIN users uu ON uu.id = c.updated_by
     LEFT JOIN users au ON au.id = c.archived_by
     LEFT JOIN record_favorites rf
       ON rf.company_id = c.company_id AND rf.user_id = $3
      AND rf.entity_type = 'customer' AND rf.entity_id = c.id
     WHERE c.company_id = $1 AND c.id = $2`,
    [companyId, id, userId ?? null],
  );
  const c = rows[0];
  if (!c) return null;
  const contact = (await client.query(
    `SELECT * FROM customer_contacts WHERE company_id = $1 AND customer_id = $2 ORDER BY is_primary DESC LIMIT 1`,
    [companyId, id],
  )).rows[0];
  const addr = (await client.query(
    `SELECT * FROM addresses WHERE company_id = $1 AND customer_id = $2 ORDER BY is_default DESC LIMIT 1`,
    [companyId, id],
  )).rows[0];
  const tags = (await client.query(
    `SELECT t.name FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = $1`,
    [id],
  )).rows.map((r: { name: string }) => r.name);
  const name = contact
    ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || 'Customer'
    : 'Customer';
  return {
    id: c.id,
    name,
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    phoneExt: contact?.phone_ext ?? undefined,
    address: formatAddress(addr),
    companyId: c.company_id,
    notes: c.notes ?? '',
    tags,
    status: c.status,
    createdAt: c.created_at.toISOString().slice(0, 10),
    totalJobs: c.total_jobs,
    totalSpent: Number(c.total_spent),
    primaryContact: contact
      ? {
          firstName: contact.first_name,
          lastName: contact.last_name,
          phone: contact.phone ?? '',
          phoneExt: contact.phone_ext,
          email: contact.email ?? '',
        }
      : undefined,
    serviceLocation: addr
      ? {
          locationName: addr.location_name,
          gatedProperty: addr.gated_property,
          street: addr.street ?? '',
          unit: addr.unit,
          city: addr.city ?? '',
          state: addr.state ?? '',
          zip: addr.zip ?? '',
        }
      : undefined,
    customerType: c.customer_type,
    source: c.source,
    parentCustomerId: c.parent_customer_id,
    paymentTerms: c.payment_terms,
    taxExempt: c.tax_exempt,
    city: addr?.city ?? '',
    ownerUserId: c.owner_user_id,
    ownerName: c.owner_name ?? null,
    createdBy: c.created_by,
    createdByName: c.created_by_name ?? null,
    updatedBy: c.updated_by,
    updatedByName: c.updated_by_name ?? null,
    archivedAt: c.archived_at ? c.archived_at.toISOString() : null,
    archivedByName: c.archived_by_name ?? null,
    starred: !!c.is_starred,
    pinned: !!c.is_pinned,
  };
}

async function upsertTags(client: import('pg').PoolClient, companyId: string, customerId: string, names: string[]) {
  await client.query(`DELETE FROM customer_tags WHERE customer_id = $1`, [customerId]);
  for (const name of names.map((n) => n.trim()).filter(Boolean)) {
    const tag = await client.query(
      `INSERT INTO tags (company_id, name) VALUES ($1,$2)
       ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [companyId, name],
    );
    await client.query(
      `INSERT INTO customer_tags (company_id, customer_id, tag_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [companyId, customerId, tag.rows[0].id],
    );
  }
}

customersRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const userId = req.auth.userId;
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? 'all');
  const type = String(req.query.type ?? 'all');
  const source = String(req.query.source ?? 'all');
  const city = String(req.query.city ?? '').trim().toLowerCase();
  const archived = String(req.query.archived ?? 'active');
  const starred = String(req.query.starred ?? '') === 'true';
  const like = `%${search}%`;
  const { page, pageSize, offset } = parsePage(req.query);
  const where = `
    c.company_id = $1
    AND (
      $2 = 'all'
      OR ($2 = 'active' AND c.archived_at IS NULL)
      OR ($2 = 'archived' AND c.archived_at IS NOT NULL)
    )
    AND ($3::text = 'all' OR c.status = $3)
    AND ($4::text = 'all' OR c.customer_type = $4)
    AND ($5::text = 'all' OR c.source = $5)
    AND ($6::boolean IS NOT TRUE OR coalesce(rf.starred, false))
    AND (
      $7 = ''
      OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $8
      OR coalesce(cc.email, '') ILIKE $8
      OR coalesce(cc.phone, '') ILIKE $8
      OR coalesce(a.city, '') ILIKE $8
    )
    AND ($9 = '' OR lower(coalesce(a.city, '')) LIKE $9)
  `;
  const joins = `
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT first_name, last_name, email, phone FROM customer_contacts
      WHERE customer_id = c.id ORDER BY is_primary DESC LIMIT 1
    ) cc ON true
    LEFT JOIN LATERAL (
      SELECT city FROM addresses WHERE customer_id = c.id ORDER BY is_default DESC LIMIT 1
    ) a ON true
    LEFT JOIN record_favorites rf
      ON rf.company_id = c.company_id AND rf.user_id = $10
     AND rf.entity_type = 'customer' AND rf.entity_id = c.id
  `;
  const params = [companyId, archived, status, type, source, starred, search, like, city ? `%${city}%` : '', userId];
  const total = await client.query(`SELECT count(*)::int AS n ${joins} WHERE ${where}`, params);
  const { rows } = await client.query(
    `SELECT c.id ${joins} WHERE ${where}
     ORDER BY coalesce(rf.pinned, false) DESC, c.updated_at DESC
     LIMIT $11 OFFSET $12`,
    [...params, pageSize, offset],
  );
  const items = [];
  for (const r of rows) {
    const mapped = await mapCustomer(client, companyId, r.id, userId);
    if (mapped) items.push(mapped);
  }
  res.json({ items, page, pageSize, total: total.rows[0].n });
}));

customersRouter.get('/export', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const { rows } = await client.query(`SELECT id FROM customers WHERE company_id = $1 ORDER BY created_at DESC`, [companyId]);
  const items = [];
  for (const r of rows) {
    const mapped = await mapCustomer(client, companyId, r.id);
    if (mapped) items.push(mapped);
  }
  res.json({ items });
}));

customersRouter.get('/duplicates', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const email = String(req.query.email ?? '').trim().toLowerCase();
  const phone = last10(String(req.query.phone ?? ''));
  const excludeId = String(req.query.excludeId ?? '') || null;
  if (!email && !phone) {
    res.json({ items: [] });
    return;
  }
  const { rows } = await client.query(
    `SELECT DISTINCT c.id, c.status,
            coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS name,
            cc.email, cc.phone
     FROM customers c
     JOIN customer_contacts cc ON cc.customer_id = c.id AND cc.company_id = c.company_id
     WHERE c.company_id = $1
       AND ($4::uuid IS NULL OR c.id <> $4)
       AND (
         ($2 <> '' AND lower(coalesce(cc.email, '')) = $2)
         OR ($3 <> '' AND right(regexp_replace(coalesce(cc.phone, ''), '\\D', '', 'g'), 10) = $3)
       )
     LIMIT 8`,
    [companyId, email, phone, excludeId],
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone, status: r.status,
    })),
  });
}));

customersRouter.post('/import', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const body = z.object({
    rows: z.array(createSchema),
  }).parse(req.body);
  let created = 0;
  const errors: string[] = [];
  for (const row of body.rows) {
    try {
      const first = row.firstName || (row.name ?? '').split(' ')[0] || '';
      const last = row.lastName || (row.name ?? '').split(' ').slice(1).join(' ');
      if (!first && !row.phone && !row.email) {
        errors.push('Skipped empty row');
        continue;
      }
      const ins = await client.query(
        `INSERT INTO customers (company_id, status, customer_type, source, notes, payment_terms, tax_exempt)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [companyId, row.status ?? 'active', row.customerType ?? null, row.source ?? null, row.notes ?? '', row.paymentTerms ?? null, row.taxExempt ?? false],
      );
      const id = ins.rows[0].id;
      await client.query(
        `INSERT INTO customer_contacts (company_id, customer_id, first_name, last_name, phone, phone_ext, email, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [companyId, id, first, last, row.phone, row.phoneExt ?? null, row.email || null],
      );
      await client.query(
        `INSERT INTO addresses (company_id, customer_id, location_name, street, unit, city, state, zip, gated_property, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
        [companyId, id, row.locationName ?? 'Home', row.street, row.unit ?? null, row.city, row.state, row.zip, row.gatedProperty ?? false],
      );
      if (row.tags?.length) await upsertTags(client, companyId, id, row.tags);
      created += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'import row failed');
    }
  }
  res.status(201).json({ created, errors });
}));

customersRouter.post('/merge', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const { keepId, mergeId } = z.object({
    keepId: z.string().uuid(),
    mergeId: z.string().uuid(),
  }).parse(req.body);
  if (keepId === mergeId) throw badRequest('Cannot merge a customer into itself');
  const keep = await mapCustomer(client, companyId, keepId);
  const merge = await mapCustomer(client, companyId, mergeId);
  if (!keep || !merge) throw notFound('Customer');

  await client.query(`UPDATE customer_contacts SET is_primary = false, customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE addresses SET is_default = false, customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE jobs SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE estimates SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE invoices SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE communications SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE service_agreements SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE customer_notes SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`UPDATE follow_ups SET customer_id = $3 WHERE company_id = $1 AND customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(
    `INSERT INTO customer_tags (company_id, customer_id, tag_id)
     SELECT company_id, $3, tag_id FROM customer_tags WHERE customer_id = $2
     ON CONFLICT DO NOTHING`,
    [companyId, mergeId, keepId],
  );
  await client.query(`DELETE FROM customer_tags WHERE customer_id = $1`, [mergeId]);
  await client.query(`UPDATE customers SET parent_customer_id = $3 WHERE company_id = $1 AND parent_customer_id = $2`, [companyId, mergeId, keepId]);
  await client.query(`DELETE FROM customers WHERE company_id = $1 AND id = $2`, [companyId, mergeId]);
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'customer.merge',
    entityType: 'customer', entityId: keepId, metadata: { merged: mergeId },
  });
  res.json(await mapCustomer(client, companyId, keepId));
}));

customersRouter.post('/', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const body = createSchema.parse(req.body);
  const companyId = req.auth.companyId!;
  const first = body.firstName || (body.name ?? '').split(' ')[0] || '';
  const last = body.lastName || (body.name ?? '').split(' ').slice(1).join(' ');
  const created = await client.query(
    `INSERT INTO customers (company_id, status, customer_type, source, notes, payment_terms, tax_exempt, parent_customer_id, created_by, owner_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [companyId, body.status, body.customerType ?? null, body.source ?? null, body.notes, body.paymentTerms ?? null, body.taxExempt ?? false, body.parentCustomerId ?? null, req.auth.userId, body.ownerUserId ?? req.auth.userId],
  );
  const id = created.rows[0].id;
  await client.query(
    `INSERT INTO customer_contacts (company_id, customer_id, first_name, last_name, phone, phone_ext, email, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
    [companyId, id, first, last, body.phone, body.phoneExt ?? null, body.email || null],
  );
  await client.query(
    `INSERT INTO addresses (company_id, customer_id, location_name, street, unit, city, state, zip, gated_property, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
    [companyId, id, body.locationName ?? 'Home', body.street, body.unit ?? null, body.city, body.state, body.zip, body.gatedProperty],
  );
  await upsertTags(client, companyId, id, body.tags);
  res.status(201).json(await mapCustomer(client, companyId, id, req.auth.userId));
}));

customersRouter.post('/bulk', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    ids: z.array(z.string().uuid()).min(1).max(50),
    action: z.enum(['archive', 'restore', 'status']),
    status: z.enum(['active', 'inactive', 'lead']).optional(),
  }).parse(req.body);
  if (body.action === 'status' && !body.status) throw badRequest('status is required');
  const companyId = req.auth.companyId!;
  let n = 0;
  if (body.action === 'archive') {
    const r = await client.query(
      `UPDATE customers SET archived_at = now(), archived_by = $3, updated_by = $3
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL`,
      [companyId, body.ids, req.auth.userId],
    );
    n = r.rowCount ?? 0;
  } else if (body.action === 'restore') {
    const r = await client.query(
      `UPDATE customers SET archived_at = NULL, archived_by = NULL, updated_by = $3
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NOT NULL`,
      [companyId, body.ids, req.auth.userId],
    );
    n = r.rowCount ?? 0;
  } else {
    const r = await client.query(
      `UPDATE customers SET status = $3, updated_by = $4
       WHERE company_id = $1 AND id = ANY($2::uuid[])`,
      [companyId, body.ids, body.status, req.auth.userId],
    );
    n = r.rowCount ?? 0;
  }
  res.json({ ok: true, updated: n });
}));

customersRouter.post('/:id/archive', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `UPDATE customers SET archived_at = now(), archived_by = $3, updated_by = $3
     WHERE company_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
    [req.auth.companyId, req.params.id, req.auth.userId],
  );
  if (!r.rowCount) throw notFound('Customer');
  await audit(client, {
    actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'customer.archive',
    entityType: 'customer', entityId: req.params.id,
  });
  res.json(await mapCustomer(client, req.auth.companyId!, req.params.id, req.auth.userId));
}));

customersRouter.post('/:id/restore', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `UPDATE customers SET archived_at = NULL, archived_by = NULL, updated_by = $3
     WHERE company_id = $1 AND id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [req.auth.companyId, req.params.id, req.auth.userId],
  );
  if (!r.rowCount) throw notFound('Customer');
  await audit(client, {
    actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'customer.restore',
    entityType: 'customer', entityId: req.params.id,
  });
  res.json(await mapCustomer(client, req.auth.companyId!, req.params.id, req.auth.userId));
}));

customersRouter.get('/:id', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const mapped = await mapCustomer(client, companyId, req.params.id, req.auth.userId);
  if (!mapped) throw notFound('Customer');
  const contacts = await client.query(
    `SELECT * FROM customer_contacts WHERE company_id = $1 AND customer_id = $2 ORDER BY is_primary DESC, first_name`,
    [companyId, req.params.id],
  );
  const addresses = await client.query(
    `SELECT * FROM addresses WHERE company_id = $1 AND customer_id = $2 ORDER BY is_default DESC, location_name`,
    [companyId, req.params.id],
  );
  res.json({
    ...mapped,
    contacts: contacts.rows.map((r) => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name,
      phone: r.phone ?? '', phoneExt: r.phone_ext, email: r.email ?? '', isPrimary: r.is_primary,
    })),
    addresses: addresses.rows.map((r) => ({
      id: r.id, locationName: r.location_name, street: r.street ?? '', unit: r.unit,
      city: r.city ?? '', state: r.state ?? '', zip: r.zip ?? '',
      gatedProperty: r.gated_property, isDefault: r.is_default, formatted: formatAddress(r),
    })),
  });
}));

customersRouter.patch('/:id', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const existing = await mapCustomer(client, companyId, req.params.id);
  if (!existing) throw notFound('Customer');
  const body = createSchema.partial().parse(req.body);
  await client.query(
    `UPDATE customers SET
       status = coalesce($3, status),
       customer_type = coalesce($4, customer_type),
       source = coalesce($5, source),
       notes = coalesce($6, notes),
       payment_terms = coalesce($7, payment_terms),
       tax_exempt = coalesce($8, tax_exempt),
       parent_customer_id = CASE WHEN $9::uuid IS NULL AND $10 THEN parent_customer_id ELSE $9 END,
       owner_user_id = CASE WHEN $11::boolean THEN owner_user_id ELSE $12::uuid END,
       updated_by = $13
     WHERE company_id = $1 AND id = $2`,
    [
      companyId, req.params.id, body.status ?? null, body.customerType ?? null, body.source ?? null, body.notes ?? null,
      body.paymentTerms ?? null, body.taxExempt ?? null, body.parentCustomerId ?? null, body.parentCustomerId === undefined,
      body.ownerUserId === undefined, body.ownerUserId ?? null, req.auth.userId,
    ],
  );
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'customer.update',
    entityType: 'customer', entityId: req.params.id,
  });
  if (body.name || body.firstName || body.lastName || body.email !== undefined || body.phone !== undefined) {
    const first = body.firstName ?? body.name?.split(' ')[0] ?? existing.primaryContact?.firstName ?? '';
    const last = body.lastName ?? body.name?.split(' ').slice(1).join(' ') ?? existing.primaryContact?.lastName ?? '';
    await client.query(
      `UPDATE customer_contacts SET first_name=$3, last_name=$4, phone=coalesce($5, phone), phone_ext=coalesce($6, phone_ext), email=coalesce($7, email)
       WHERE company_id=$1 AND customer_id=$2 AND is_primary = true`,
      [companyId, req.params.id, first, last, body.phone ?? null, body.phoneExt ?? null, body.email || null],
    );
  }
  if (body.street !== undefined || body.city !== undefined) {
    await client.query(
      `UPDATE addresses SET location_name=coalesce($3, location_name), street=coalesce($4, street), unit=$5, city=coalesce($6, city), state=coalesce($7, state), zip=coalesce($8, zip), gated_property=coalesce($9, gated_property)
       WHERE company_id=$1 AND customer_id=$2 AND is_default = true`,
      [companyId, req.params.id, body.locationName ?? null, body.street ?? null, body.unit ?? null, body.city ?? null, body.state ?? null, body.zip ?? null, body.gatedProperty ?? null],
    );
  }
  if (body.tags) await upsertTags(client, companyId, req.params.id, body.tags);
  res.json(await mapCustomer(client, companyId, req.params.id, req.auth.userId));
}));

customersRouter.delete('/:id', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const id = req.params.id;
  const related = await client.query(
    `SELECT
       (SELECT count(*)::int FROM jobs WHERE company_id = $1 AND customer_id = $2) AS jobs,
       (SELECT count(*)::int FROM estimates WHERE company_id = $1 AND customer_id = $2) AS estimates,
       (SELECT count(*)::int FROM invoices WHERE company_id = $1 AND customer_id = $2) AS invoices`,
    [companyId, id],
  );
  const counts = related.rows[0];
  if (counts.jobs + counts.estimates + counts.invoices > 0) {
    throw conflict('This customer has jobs, estimates, or invoices. Archive the record, merge it, or set status to inactive instead of deleting.');
  }
  const r = await client.query(`DELETE FROM customers WHERE company_id = $1 AND id = $2 RETURNING id`, [companyId, id]);
  if (!r.rowCount) throw notFound('Customer');
  await audit(client, {
    actorUserId: req.auth.userId, companyId, action: 'customer.delete',
    entityType: 'customer', entityId: id,
  });
  res.json({ ok: true });
}));

customersRouter.use('/:customerId', customerNestedRouter);
