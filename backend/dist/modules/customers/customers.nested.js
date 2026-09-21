import { Router } from 'express';
import { z } from 'zod';
import { tenantRoute } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound, badRequest } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { formatAddress } from '../../utils/helpers.js';
export const customerNestedRouter = Router({ mergeParams: true });
async function assertCustomer(client, companyId, id) {
    const { rows } = await client.query(`SELECT id FROM customers WHERE company_id = $1 AND id = $2`, [companyId, id]);
    if (!rows[0])
        throw notFound('Customer');
}
function customerId(req) {
    return req.params.customerId || req.params.id;
}
const contactSchema = z.object({
    firstName: z.string().optional().default(''),
    lastName: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    phoneExt: z.string().optional(),
    email: z.string().optional().default(''),
    isPrimary: z.boolean().optional(),
});
const addressSchema = z.object({
    locationName: z.string().optional().default('Home'),
    street: z.string().optional().default(''),
    unit: z.string().optional(),
    city: z.string().optional().default(''),
    state: z.string().optional().default(''),
    zip: z.string().optional().default(''),
    gatedProperty: z.boolean().optional().default(false),
    isDefault: z.boolean().optional(),
});
function mapContact(r) {
    return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        phone: r.phone ?? '',
        phoneExt: r.phone_ext,
        email: r.email ?? '',
        isPrimary: r.is_primary,
    };
}
function mapAddress(r) {
    return {
        id: r.id,
        locationName: r.location_name,
        street: r.street ?? '',
        unit: r.unit,
        city: r.city ?? '',
        state: r.state ?? '',
        zip: r.zip ?? '',
        gatedProperty: r.gated_property,
        isDefault: r.is_default,
        formatted: formatAddress(r),
    };
}
customerNestedRouter.get('/contacts', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const { rows } = await client.query(`SELECT * FROM customer_contacts WHERE company_id = $1 AND customer_id = $2 ORDER BY is_primary DESC, first_name`, [companyId, id]);
    res.json({ items: rows.map(mapContact) });
}));
customerNestedRouter.post('/contacts', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const body = contactSchema.parse(req.body);
    if (body.isPrimary) {
        await client.query(`UPDATE customer_contacts SET is_primary = false WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    }
    const created = await client.query(`INSERT INTO customer_contacts (company_id, customer_id, first_name, last_name, phone, phone_ext, email, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [companyId, id, body.firstName, body.lastName, body.phone, body.phoneExt ?? null, body.email || null, body.isPrimary ?? false]);
    await audit(client, {
        actorUserId: req.auth.userId, companyId, action: 'customer.contact.add',
        entityType: 'customer', entityId: id,
    });
    res.status(201).json(mapContact(created.rows[0]));
}));
customerNestedRouter.patch('/contacts/:contactId', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    const body = contactSchema.partial().parse(req.body);
    if (body.isPrimary) {
        await client.query(`UPDATE customer_contacts SET is_primary = false WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    }
    const r = await client.query(`UPDATE customer_contacts SET
       first_name = coalesce($4, first_name), last_name = coalesce($5, last_name),
       phone = coalesce($6, phone), phone_ext = coalesce($7, phone_ext), email = coalesce($8, email),
       is_primary = coalesce($9, is_primary)
     WHERE company_id = $1 AND customer_id = $2 AND id = $3 RETURNING *`, [
        companyId, id, req.params.contactId,
        body.firstName ?? null, body.lastName ?? null, body.phone ?? null,
        body.phoneExt ?? null, body.email ?? null, body.isPrimary ?? null,
    ]);
    if (!r.rowCount)
        throw notFound('Contact');
    res.json(mapContact(r.rows[0]));
}));
customerNestedRouter.delete('/contacts/:contactId', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    const r = await client.query(`DELETE FROM customer_contacts WHERE company_id = $1 AND customer_id = $2 AND id = $3 AND is_primary = false RETURNING id`, [companyId, id, req.params.contactId]);
    if (!r.rowCount)
        throw badRequest('Cannot delete primary contact (or not found)');
    res.json({ ok: true });
}));
customerNestedRouter.get('/addresses', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const { rows } = await client.query(`SELECT * FROM addresses WHERE company_id = $1 AND customer_id = $2 ORDER BY is_default DESC, location_name`, [companyId, id]);
    res.json({ items: rows.map(mapAddress) });
}));
customerNestedRouter.post('/addresses', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const body = addressSchema.parse(req.body);
    if (body.isDefault) {
        await client.query(`UPDATE addresses SET is_default = false WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    }
    const created = await client.query(`INSERT INTO addresses (company_id, customer_id, location_name, street, unit, city, state, zip, gated_property, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [companyId, id, body.locationName, body.street, body.unit ?? null, body.city, body.state, body.zip, body.gatedProperty, body.isDefault ?? false]);
    await audit(client, {
        actorUserId: req.auth.userId, companyId, action: 'customer.address.add',
        entityType: 'customer', entityId: id,
    });
    res.status(201).json(mapAddress(created.rows[0]));
}));
customerNestedRouter.patch('/addresses/:addressId', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    const body = addressSchema.partial().parse(req.body);
    if (body.isDefault) {
        await client.query(`UPDATE addresses SET is_default = false WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    }
    const r = await client.query(`UPDATE addresses SET
       location_name = coalesce($4, location_name), street = coalesce($5, street), unit = $6,
       city = coalesce($7, city), state = coalesce($8, state), zip = coalesce($9, zip),
       gated_property = coalesce($10, gated_property), is_default = coalesce($11, is_default)
     WHERE company_id = $1 AND customer_id = $2 AND id = $3 RETURNING *`, [
        companyId, id, req.params.addressId,
        body.locationName ?? null, body.street ?? null, body.unit ?? null,
        body.city ?? null, body.state ?? null, body.zip ?? null,
        body.gatedProperty ?? null, body.isDefault ?? null,
    ]);
    if (!r.rowCount)
        throw notFound('Address');
    res.json(mapAddress(r.rows[0]));
}));
customerNestedRouter.delete('/addresses/:addressId', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    const r = await client.query(`DELETE FROM addresses WHERE company_id = $1 AND customer_id = $2 AND id = $3 AND is_default = false RETURNING id`, [companyId, id, req.params.addressId]);
    if (!r.rowCount)
        throw badRequest('Cannot delete default address (or not found)');
    res.json({ ok: true });
}));
customerNestedRouter.get('/notes', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const { rows } = await client.query(`SELECT n.id, n.body, n.created_at, u.name AS author_name, n.author_id
     FROM customer_notes n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.company_id = $1 AND n.customer_id = $2
     ORDER BY n.created_at DESC`, [companyId, id]);
    res.json({
        items: rows.map((r) => ({
            id: r.id,
            body: r.body,
            authorId: r.author_id,
            authorName: r.author_name ?? 'Staff',
            createdAt: r.created_at.toISOString(),
        })),
    });
}));
customerNestedRouter.post('/notes', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    const created = await client.query(`INSERT INTO customer_notes (company_id, customer_id, author_id, body) VALUES ($1,$2,$3,$4) RETURNING *`, [companyId, id, req.auth.userId, body.body]);
    await audit(client, {
        actorUserId: req.auth.userId, companyId, action: 'customer.note.add',
        entityType: 'customer', entityId: id,
    });
    res.status(201).json({
        id: created.rows[0].id,
        body: created.rows[0].body,
        authorId: req.auth.userId,
        createdAt: created.rows[0].created_at.toISOString(),
    });
}));
customerNestedRouter.delete('/notes/:noteId', requirePermission('customers.write'), tenantRoute(async (req, res, client) => {
    const r = await client.query(`DELETE FROM customer_notes WHERE company_id = $1 AND customer_id = $2 AND id = $3 RETURNING id`, [req.auth.companyId, customerId(req), req.params.noteId]);
    if (!r.rowCount)
        throw notFound('Note');
    res.json({ ok: true });
}));
customerNestedRouter.get('/activity', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const id = customerId(req);
    await assertCustomer(client, companyId, id);
    const items = [];
    const jobs = await client.query(`SELECT id, title, status, created_at FROM jobs WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const j of jobs.rows) {
        items.push({
            at: j.created_at.toISOString(), kind: 'job', title: `Job: ${j.title}`,
            detail: j.status, href: `/admin/jobs/${j.id}`,
        });
    }
    const estimates = await client.query(`SELECT id, estimate_number, status, total, created_at FROM estimates WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const e of estimates.rows) {
        items.push({
            at: e.created_at.toISOString(), kind: 'estimate', title: `Estimate ${e.estimate_number}`,
            detail: `${e.status} · $${Number(e.total).toFixed(2)}`, href: `/admin/estimates/${e.id}`,
        });
    }
    const invoices = await client.query(`SELECT id, invoice_number, status, total, created_at, paid_at FROM invoices WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const i of invoices.rows) {
        items.push({
            at: i.created_at.toISOString(), kind: 'invoice', title: `Invoice ${i.invoice_number}`,
            detail: `${i.status} · $${Number(i.total).toFixed(2)}`, href: `/admin/invoices?id=${i.id}`,
        });
        if (i.paid_at) {
            items.push({
                at: i.paid_at.toISOString(), kind: 'invoice', title: `Invoice ${i.invoice_number} paid`,
                href: `/admin/invoices?id=${i.id}`,
            });
        }
    }
    const followUps = await client.query(`SELECT title, due_date, done, created_at FROM follow_ups WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const f of followUps.rows) {
        items.push({
            at: f.created_at.toISOString(),
            kind: 'followup',
            title: f.done ? `Follow-up completed: ${f.title}` : `Follow-up: ${f.title}`,
            detail: f.due_date ? `Due ${f.due_date.toISOString().slice(0, 10)}` : undefined,
        });
    }
    const comms = await client.query(`SELECT type, direction, body, created_at FROM communications WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const c of comms.rows) {
        items.push({
            at: c.created_at.toISOString(), kind: 'comm',
            title: `${c.direction} ${c.type}`, detail: c.body ? String(c.body).slice(0, 120) : undefined,
        });
    }
    const notes = await client.query(`SELECT body, created_at FROM customer_notes WHERE company_id = $1 AND customer_id = $2`, [companyId, id]);
    for (const n of notes.rows) {
        items.push({ at: n.created_at.toISOString(), kind: 'note', title: 'Note', detail: n.body });
    }
    const audits = await client.query(`SELECT action, created_at FROM audit_logs WHERE company_id = $1 AND entity_type = 'customer' AND entity_id = $2`, [companyId, id]);
    for (const a of audits.rows) {
        items.push({ at: a.created_at.toISOString(), kind: 'audit', title: a.action.replace(/\./g, ' ') });
    }
    items.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ items: items.slice(0, 100) });
}));
//# sourceMappingURL=customers.nested.js.map