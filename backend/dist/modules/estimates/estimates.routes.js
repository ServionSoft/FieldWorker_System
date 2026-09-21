import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest, conflict } from '../../utils/errors.js';
import { assertPlanLimits, notifyByPermission, parsePage, nextNumber, formatAddress } from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { customerEmailFor, sendTenantCrmEmail } from '../../services/tenantCrmEmail.js';
export const estimatesRouter = Router();
estimatesRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('estimates.read'));
async function memberIdForUser(client, companyId, userId) {
    const { rows } = await client.query(`SELECT id FROM company_members WHERE company_id = $1 AND user_id = $2`, [companyId, userId]);
    return rows[0]?.id;
}
async function mapEstimate(client, companyId, id) {
    const { rows } = await client.query(`SELECT e.*,
       cc.first_name, cc.last_name, cc.phone AS contact_phone, cc.email AS contact_email,
       a.location_name, a.street, a.unit, a.city, a.state, a.zip, a.gated_property
     FROM estimates e
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     LEFT JOIN addresses a ON a.id = e.address_id
     WHERE e.company_id = $1 AND e.id = $2`, [companyId, id]);
    const e = rows[0];
    if (!e)
        return null;
    const items = (await client.query(`SELECT description, quantity, unit_price, total FROM estimate_line_items WHERE estimate_id = $1`, [id])).rows.map((r) => ({
        description: r.description, quantity: Number(r.quantity), unitPrice: Number(r.unit_price), total: Number(r.total),
    }));
    const assignedWorkerIds = (await client.query(`SELECT m.user_id FROM estimate_assignees ea JOIN company_members m ON m.id = ea.member_id WHERE ea.estimate_id = $1`, [id])).rows.map((r) => r.user_id);
    const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Customer';
    return {
        id: e.id,
        estimateNumber: e.estimate_number,
        companyId: e.company_id,
        customerId: e.customer_id,
        customerName: name,
        customerEmail: e.contact_email ?? '',
        customerPhone: e.contact_phone ?? '',
        customerAddress: formatAddress(e),
        status: e.status,
        items,
        subtotal: Number(e.subtotal),
        tax: Number(e.tax),
        total: Number(e.total),
        notes: e.notes ?? '',
        validUntil: e.valid_until ? e.valid_until.toISOString().slice(0, 10) : '',
        createdAt: e.created_at.toISOString().slice(0, 10),
        updatedAt: e.updated_at.toISOString().slice(0, 10),
        convertedJobId: e.converted_job_id,
        category: e.category,
        primaryContact: {
            firstName: e.first_name ?? '', lastName: e.last_name ?? '',
            phone: e.contact_phone ?? '', email: e.contact_email ?? '',
        },
        serviceLocation: {
            locationName: e.location_name, gatedProperty: e.gated_property,
            street: e.street ?? '', unit: e.unit, city: e.city ?? '', state: e.state ?? '', zip: e.zip ?? '',
        },
        poNumber: e.po_number,
        referralSource: e.referral_source,
        opportunityRating: e.opportunity_rating,
        tags: [],
        description: e.description,
        requestedOn: e.requested_on ? e.requested_on.toISOString().slice(0, 10) : undefined,
        arrivalStart: e.arrival_start ? String(e.arrival_start).slice(0, 5) : undefined,
        arrivalEnd: e.arrival_end ? String(e.arrival_end).slice(0, 5) : undefined,
        estimatedDuration: e.estimated_duration_hours != null ? Number(e.estimated_duration_hours) : undefined,
        assignedWorkerIds,
        notesForTechs: e.notes_for_techs,
        taxRate: Number(e.tax_rate),
        noteToCustomer: e.note_to_customer,
    };
}
estimatesRouter.get('/', tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? 'all');
    const like = `%${search}%`;
    const { page, pageSize, offset } = parsePage(req.query);
    const { rows } = await client.query(`SELECT e.id
     FROM estimates e
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE e.company_id = $1
       AND ($2 = 'all' OR e.status = $2)
       AND (
         $3 = ''
         OR e.estimate_number ILIKE $4
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $4
       )
     ORDER BY e.created_at DESC
     LIMIT $5 OFFSET $6`, [companyId, status, search, like, pageSize, offset]);
    const total = await client.query(`SELECT count(*)::int AS n
     FROM estimates e
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE e.company_id = $1
       AND ($2 = 'all' OR e.status = $2)
       AND (
         $3 = ''
         OR e.estimate_number ILIKE $4
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $4
       )`, [companyId, status, search, like]);
    const items = [];
    for (const r of rows)
        items.push(await mapEstimate(client, companyId, r.id));
    res.json({ items: items.filter(Boolean), page, pageSize, total: total.rows[0].n });
}));
const estBody = z.object({
    customerId: z.string().uuid(),
    category: z.enum(['plumbing', 'electrical', 'hvac', 'general']).optional().default('plumbing'),
    description: z.string().optional(),
    notes: z.string().optional().default(''),
    validUntil: z.string().optional(),
    taxRate: z.number().optional().default(0),
    poNumber: z.string().optional(),
    referralSource: z.string().optional(),
    rating: z.number().optional(),
    requestedOn: z.string().optional(),
    arrivalStart: z.string().optional(),
    arrivalEnd: z.string().optional(),
    estimatedDuration: z.number().optional(),
    assignedWorkerIds: z.array(z.string().uuid()).optional().default([]),
    notesForTechs: z.string().optional(),
    items: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        total: z.number().optional(),
    })).default([]),
});
estimatesRouter.post('/', requirePermission('estimates.write'), tenantRoute(async (req, res, client) => {
    const body = estBody.parse(req.body);
    const companyId = req.auth.companyId;
    const cust = await client.query(`SELECT id FROM customers WHERE company_id = $1 AND id = $2`, [companyId, body.customerId]);
    if (!cust.rowCount)
        throw notFound('Customer');
    const addr = await client.query(`SELECT id FROM addresses WHERE company_id = $1 AND customer_id = $2 ORDER BY is_default DESC LIMIT 1`, [companyId, body.customerId]);
    const number = await nextNumber(client, companyId, 'estimate');
    const subtotal = body.items.reduce((s, i) => s + (i.total ?? i.quantity * i.unitPrice), 0);
    const tax = +(subtotal * ((body.taxRate ?? 0) / 100)).toFixed(2);
    const created = await client.query(`INSERT INTO estimates (
       company_id, customer_id, address_id, estimate_number, status, category, description, notes,
       valid_until, tax_rate, subtotal, tax, total, po_number, referral_source, opportunity_rating,
       requested_on, arrival_start, arrival_end, estimated_duration_hours, notes_for_techs, created_by
     ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`, [
        companyId, body.customerId, addr.rows[0]?.id ?? null, number, body.category, body.description ?? null,
        body.notes, body.validUntil || null, body.taxRate, subtotal, tax, subtotal + tax,
        body.poNumber ?? null, body.referralSource ?? null, body.rating ?? null,
        body.requestedOn || null, body.arrivalStart || null, body.arrivalEnd || null,
        body.estimatedDuration ?? null, body.notesForTechs ?? null, req.auth.userId,
    ]);
    const id = created.rows[0].id;
    for (const li of body.items) {
        await client.query(`INSERT INTO estimate_line_items (company_id, estimate_id, description, quantity, unit_price, total)
       VALUES ($1,$2,$3,$4,$5,$6)`, [companyId, id, li.description, li.quantity, li.unitPrice, li.total ?? li.quantity * li.unitPrice]);
    }
    for (const uid of body.assignedWorkerIds) {
        const mid = await memberIdForUser(client, companyId, uid);
        if (mid) {
            await client.query(`INSERT INTO estimate_assignees (company_id, estimate_id, member_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [companyId, id, mid]);
        }
    }
    res.status(201).json(await mapEstimate(client, companyId, id));
}));
estimatesRouter.get('/:id', tenantRoute(async (req, res, client) => {
    const e = await mapEstimate(client, req.auth.companyId, req.params.id);
    if (!e)
        throw notFound('Estimate');
    res.json(e);
}));
estimatesRouter.patch('/:id', requirePermission('estimates.write'), tenantRoute(async (req, res, client) => {
    const body = estBody.partial().extend({ customerId: z.string().uuid().optional() }).parse(req.body);
    const companyId = req.auth.companyId;
    const existing = await mapEstimate(client, companyId, req.params.id);
    if (!existing)
        throw notFound('Estimate');
    if (body.items) {
        const subtotal = body.items.reduce((s, i) => s + (i.total ?? i.quantity * i.unitPrice), 0);
        const taxRate = body.taxRate ?? existing.taxRate;
        const tax = +(subtotal * (taxRate / 100)).toFixed(2);
        await client.query(`DELETE FROM estimate_line_items WHERE estimate_id = $1`, [req.params.id]);
        for (const li of body.items) {
            await client.query(`INSERT INTO estimate_line_items (company_id, estimate_id, description, quantity, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6)`, [companyId, req.params.id, li.description, li.quantity, li.unitPrice, li.total ?? li.quantity * li.unitPrice]);
        }
        await client.query(`UPDATE estimates SET subtotal=$3, tax=$4, total=$5, tax_rate=$6, notes=coalesce($7, notes), description=coalesce($8, description)
       WHERE company_id=$1 AND id=$2`, [companyId, req.params.id, subtotal, tax, subtotal + tax, taxRate, body.notes ?? null, body.description ?? null]);
    }
    res.json(await mapEstimate(client, companyId, req.params.id));
}));
estimatesRouter.delete('/:id', requirePermission('estimates.write'), tenantRoute(async (req, res, client) => {
    const est = await mapEstimate(client, req.auth.companyId, req.params.id);
    if (!est)
        throw notFound('Estimate');
    if (est.convertedJobId || est.status === 'converted') {
        throw conflict('Converted estimates cannot be deleted. Open the related job instead.');
    }
    const r = await client.query(`DELETE FROM estimates WHERE company_id = $1 AND id = $2 RETURNING id`, [req.auth.companyId, req.params.id]);
    if (!r.rowCount)
        throw notFound('Estimate');
    res.json({ ok: true });
}));
estimatesRouter.post('/:id/status', requirePermission('estimates.write'), tenantRoute(async (req, res, client) => {
    const body = z.object({ status: z.enum(['draft', 'sent', 'approved', 'rejected', 'converted']) }).parse(req.body);
    const r = await client.query(`UPDATE estimates SET status = $3 WHERE company_id = $1 AND id = $2 RETURNING id, estimate_number`, [req.auth.companyId, req.params.id, body.status]);
    if (!r.rowCount)
        throw notFound('Estimate');
    if (body.status === 'sent') {
        const est = await mapEstimate(client, req.auth.companyId, req.params.id);
        if (est?.customerId) {
            const cust = await customerEmailFor(client, req.auth.companyId, est.customerId);
            const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [req.auth.companyId]);
            if (cust) {
                await sendTenantCrmEmail(client, {
                    companyId: req.auth.companyId,
                    type: 'estimate',
                    to: cust.email,
                    customerId: est.customerId,
                    estimateId: est.id,
                    userId: req.auth.userId,
                    vars: {
                        customerName: cust.name,
                        companyName: company.rows[0]?.name ?? '',
                        estimateNumber: est.estimateNumber,
                    },
                    fallbackSubject: `Estimate ${est.estimateNumber}`,
                    fallbackBody: `Dear ${cust.name},\n\nPlease review estimate ${est.estimateNumber}.`,
                });
            }
        }
    }
    if (body.status === 'approved') {
        await notifyByPermission(client, req.auth.companyId, 'estimates.read', {
            title: 'Estimate approved', message: `${r.rows[0].estimate_number} was approved`, type: 'success',
            eventKey: 'estimate.approved', entityType: 'estimate', entityId: req.params.id, linkPath: `/admin/estimates/${req.params.id}`,
        });
    }
    res.json(await mapEstimate(client, req.auth.companyId, req.params.id));
}));
estimatesRouter.post('/:id/convert', requirePermission('estimates.write'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const est = await mapEstimate(client, companyId, req.params.id);
    if (!est)
        throw notFound('Estimate');
    if (est.convertedJobId) {
        res.json({ jobId: est.convertedJobId });
        return;
    }
    if (est.status !== 'approved')
        throw badRequest('Estimate must be approved before conversion');
    await assertPlanLimits(client, companyId, 'jobs');
    const job = await client.query(`INSERT INTO jobs (
       company_id, customer_id, address_id, estimate_id, title, description, status, priority, category,
       scheduled_date, scheduled_time, arrival_end_time, estimated_duration_hours,
       po_number, job_source, notes_for_techs, tax_rate, note_to_customer, billing_type
     )
     SELECT company_id, customer_id, address_id, id, 'Job from ' || estimate_number, coalesce(description, notes, ''),
            CASE WHEN EXISTS (SELECT 1 FROM estimate_assignees WHERE estimate_id = estimates.id) THEN 'assigned' ELSE 'new' END,
            'medium', category, requested_on, arrival_start, arrival_end, coalesce(estimated_duration_hours, 2),
            po_number, referral_source, notes_for_techs, tax_rate, note_to_customer, 'single_invoice'
     FROM estimates WHERE id = $1
     RETURNING id`, [req.params.id]);
    const jobId = job.rows[0].id;
    await client.query(`INSERT INTO job_line_items (company_id, job_id, description, quantity, unit_price, total, taxable)
     SELECT company_id, $2, description, quantity, unit_price, total, true FROM estimate_line_items WHERE estimate_id = $1`, [req.params.id, jobId]);
    await client.query(`INSERT INTO job_assignees (company_id, job_id, member_id)
     SELECT company_id, $2, member_id FROM estimate_assignees WHERE estimate_id = $1`, [req.params.id, jobId]);
    await client.query(`INSERT INTO job_notes (company_id, job_id, author_id, body) VALUES ($1,$2,$3,$4)`, [companyId, jobId, req.auth.userId, `Created from estimate ${est.estimateNumber}`]);
    await client.query(`UPDATE estimates SET status = 'converted', converted_job_id = $2 WHERE id = $1`, [req.params.id, jobId]);
    await audit(client, {
        actorUserId: req.auth.userId, companyId, action: 'estimate.convert',
        entityType: 'estimate', entityId: req.params.id, metadata: { jobId },
    });
    res.json({ jobId });
}));
//# sourceMappingURL=estimates.routes.js.map