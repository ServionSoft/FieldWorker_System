import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest } from '../../utils/errors.js';
import { assertPlanLimits, formatAddress, notify, notifyCompanyAdmins, parsePage } from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { jobInvoiceRouter } from '../invoices/invoices.routes.js';
import { jobImagesRouter } from '../files/files.routes.js';
import { customerEmailFor, sendTenantCrmEmail } from '../../services/tenantCrmEmail.js';
export const jobsRouter = Router();
jobsRouter.use(requireAuth, requireTenant);
jobsRouter.use('/:id/invoice', jobInvoiceRouter);
jobsRouter.use('/:id/images', jobImagesRouter);
async function memberIdForUser(client, companyId, userId) {
    const { rows } = await client.query(`SELECT id FROM company_members WHERE company_id = $1 AND user_id = $2`, [companyId, userId]);
    return rows[0]?.id;
}
async function memberWantsAssignmentEmail(client, companyId, userId) {
    const { rows } = await client.query(`SELECT notify_email_assignments FROM company_members WHERE company_id = $1 AND user_id = $2`, [companyId, userId]);
    return !!rows[0]?.notify_email_assignments;
}
async function mapJob(client, companyId, id, userId) {
    const { rows } = await client.query(`SELECT j.*,
       cc.first_name, cc.last_name, cc.phone AS contact_phone, cc.email AS contact_email,
       a.location_name, a.street, a.unit, a.city, a.state, a.zip, a.gated_property,
       ou.name AS owner_name, cu.name AS created_by_name, uu.name AS updated_by_name, au.name AS archived_by_name,
       coalesce(rf.starred, false) AS is_starred, coalesce(rf.pinned, false) AS is_pinned
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     LEFT JOIN addresses a ON a.id = j.address_id
     LEFT JOIN users ou ON ou.id = j.owner_user_id
     LEFT JOIN users cu ON cu.id = j.created_by
     LEFT JOIN users uu ON uu.id = j.updated_by
     LEFT JOIN users au ON au.id = j.archived_by
     LEFT JOIN record_favorites rf
       ON rf.company_id = j.company_id AND rf.user_id = $3
      AND rf.entity_type = 'job' AND rf.entity_id = j.id
     WHERE j.company_id = $1 AND j.id = $2`, [companyId, id, userId ?? null]);
    const j = rows[0];
    if (!j)
        return null;
    const assignees = (await client.query(`SELECT m.user_id FROM job_assignees ja JOIN company_members m ON m.id = ja.member_id WHERE ja.job_id = $1`, [id])).rows.map((r) => r.user_id);
    const notes = (await client.query(`SELECT body FROM job_notes WHERE job_id = $1 ORDER BY created_at`, [id])).rows.map((r) => r.body);
    const materials = (await client.query(`SELECT name FROM job_materials WHERE job_id = $1`, [id])).rows.map((r) => r.name);
    const tasks = (await client.query(`SELECT id, title, done FROM job_tasks WHERE job_id = $1`, [id])).rows.map((r) => ({ id: r.id, title: r.title, done: r.done }));
    const lineItems = (await client.query(`SELECT id, group_name, description, warehouse, quantity, unit_price, total, taxable FROM job_line_items WHERE job_id = $1`, [id])).rows.map((r) => ({
        id: r.id, group: r.group_name, description: r.description, warehouse: r.warehouse,
        quantity: Number(r.quantity), unitPrice: Number(r.unit_price), total: Number(r.total), taxable: r.taxable,
    }));
    const images = (await client.query(`SELECT f.id FROM job_images ji JOIN files f ON f.id = ji.file_id WHERE ji.job_id = $1`, [id])).rows.map((r) => r.id);
    const name = `${j.first_name ?? ''} ${j.last_name ?? ''}`.trim() || 'Customer';
    return {
        id: j.id,
        title: j.title,
        description: j.description,
        status: j.status,
        priority: j.priority,
        companyId: j.company_id,
        customerId: j.customer_id,
        customerName: name,
        customerPhone: j.contact_phone ?? '',
        customerAddress: formatAddress(j),
        assignedWorkerId: assignees[0],
        assignedWorkerIds: assignees,
        scheduledDate: j.scheduled_date ? j.scheduled_date.toISOString().slice(0, 10) : undefined,
        scheduledTime: j.scheduled_time ? String(j.scheduled_time).slice(0, 5) : undefined,
        arrivalEndTime: j.arrival_end_time ? String(j.arrival_end_time).slice(0, 5) : undefined,
        multiDay: j.multi_day,
        endDate: j.end_date ? j.end_date.toISOString().slice(0, 10) : undefined,
        estimatedDuration: Number(j.estimated_duration_hours),
        materials,
        notes,
        images,
        createdAt: j.created_at.toISOString().slice(0, 10),
        updatedAt: j.updated_at.toISOString().slice(0, 10),
        completedAt: j.completed_at ? j.completed_at.toISOString().slice(0, 10) : undefined,
        invoiceId: j.invoice_id,
        estimateId: j.estimate_id,
        category: j.category,
        primaryContact: {
            firstName: j.first_name ?? '',
            lastName: j.last_name ?? '',
            phone: j.contact_phone ?? '',
            email: j.contact_email ?? '',
        },
        serviceLocation: {
            locationName: j.location_name,
            gatedProperty: j.gated_property,
            street: j.street ?? '',
            unit: j.unit,
            city: j.city ?? '',
            state: j.state ?? '',
            zip: j.zip ?? '',
        },
        poNumber: j.po_number,
        jobSource: j.job_source,
        agentRep: j.agent_rep,
        notesForTechs: j.notes_for_techs,
        completionNotes: j.completion_notes,
        requiresFollowUp: j.requires_follow_up,
        notifyTechs: j.notify_techs,
        tasks,
        lineItems,
        taxRate: Number(j.tax_rate),
        noteToCustomer: j.note_to_customer,
        billingType: j.billing_type,
        ownerUserId: j.owner_user_id,
        ownerName: j.owner_name ?? null,
        createdBy: j.created_by,
        createdByName: j.created_by_name ?? null,
        updatedBy: j.updated_by,
        updatedByName: j.updated_by_name ?? null,
        archivedAt: j.archived_at ? j.archived_at.toISOString() : null,
        archivedByName: j.archived_by_name ?? null,
        starred: !!j.is_starred,
        pinned: !!j.is_pinned,
    };
}
async function assertAssigned(client, jobId, memberId) {
    const { rows } = await client.query(`SELECT 1 FROM job_assignees WHERE job_id = $1 AND member_id = $2`, [jobId, memberId]);
    if (!rows[0])
        throw notFound('Job');
}
jobsRouter.get('/', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
    const companyId = req.auth.companyId;
    const userId = req.auth.userId;
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? 'all');
    const priority = String(req.query.priority ?? 'all');
    const category = String(req.query.category ?? 'all');
    const source = String(req.query.source ?? 'all');
    const workerId = String(req.query.workerId ?? 'all');
    const workerUuid = /^[0-9a-f-]{36}$/i.test(workerId) ? workerId : null;
    const unassignedOnly = workerId === 'unassigned' || status === 'unassigned';
    const dateFrom = String(req.query.dateFrom ?? '');
    const dateTo = String(req.query.dateTo ?? '');
    const archived = String(req.query.archived ?? 'active');
    const starred = String(req.query.starred ?? '') === 'true';
    const sortBy = String(req.query.sort ?? 'upcoming');
    const like = `%${search}%`;
    const { page, pageSize, offset } = parsePage(req.query);
    const orderSql = sortBy === 'newest' ? 'j.created_at DESC'
        : sortBy === 'priority' ? `CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, j.scheduled_date NULLS LAST`
            : sortBy === 'customer' ? 'cc.first_name, cc.last_name'
                : 'coalesce(j.scheduled_date, DATE \'9999-12-31\'), j.scheduled_time NULLS LAST';
    const { rows: idRows } = await client.query(`SELECT j.id
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT first_name, last_name, phone FROM customer_contacts
       WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     LEFT JOIN record_favorites rf
       ON rf.company_id = j.company_id AND rf.user_id = $1
      AND rf.entity_type = 'job' AND rf.entity_id = j.id
     WHERE j.company_id = $2
       AND ($3::text = 'field_worker' AND EXISTS (
         SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id AND ja.member_id = $4
       ) OR $3::text <> 'field_worker')
       AND (
         $5 = 'all'
         OR ($5 = 'active' AND j.archived_at IS NULL)
         OR ($5 = 'archived' AND j.archived_at IS NOT NULL)
       )
       AND ($6 = 'all' OR j.status = $6)
       AND ($7 = 'all' OR j.priority = $7)
       AND ($8 = 'all' OR j.category = $8)
       AND ($9 = 'all' OR j.job_source = $9)
       AND ($10::uuid IS NULL OR EXISTS (
              SELECT 1 FROM job_assignees ja JOIN company_members m ON m.id = ja.member_id
              WHERE ja.job_id = j.id AND m.user_id = $10
            ))
       AND ($11::boolean IS NOT TRUE OR NOT EXISTS (SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id))
       AND ($12 = '' OR j.scheduled_date >= $12::date)
       AND ($13 = '' OR j.scheduled_date <= $13::date)
       AND ($14::boolean IS NOT TRUE OR coalesce(rf.starred, false))
       AND (
         $15 = ''
         OR j.title ILIKE $16
         OR coalesce(j.description, '') ILIKE $16
         OR coalesce(j.po_number, '') ILIKE $16
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $16
         OR coalesce(cc.phone, '') ILIKE $16
       )
     ORDER BY coalesce(rf.pinned, false) DESC, ${orderSql}
     LIMIT $17 OFFSET $18`, [
        userId, companyId, req.auth.role, req.auth.memberId ?? null,
        archived, status === 'unassigned' ? 'all' : status, priority, category, source, workerUuid,
        unassignedOnly, dateFrom, dateTo, starred, search, like, pageSize, offset,
    ]);
    const totalQ = await client.query(`SELECT count(*)::int AS n
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT first_name, last_name, phone FROM customer_contacts
       WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     LEFT JOIN record_favorites rf
       ON rf.company_id = j.company_id AND rf.user_id = $1
      AND rf.entity_type = 'job' AND rf.entity_id = j.id
     WHERE j.company_id = $2
       AND ($3::text = 'field_worker' AND EXISTS (
         SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id AND ja.member_id = $4
       ) OR $3::text <> 'field_worker')
       AND (
         $5 = 'all'
         OR ($5 = 'active' AND j.archived_at IS NULL)
         OR ($5 = 'archived' AND j.archived_at IS NOT NULL)
       )
       AND ($6 = 'all' OR j.status = $6)
       AND ($7 = 'all' OR j.priority = $7)
       AND ($8 = 'all' OR j.category = $8)
       AND ($9 = 'all' OR j.job_source = $9)
       AND ($10::uuid IS NULL OR EXISTS (
              SELECT 1 FROM job_assignees ja JOIN company_members m ON m.id = ja.member_id
              WHERE ja.job_id = j.id AND m.user_id = $10
            ))
       AND ($11::boolean IS NOT TRUE OR NOT EXISTS (SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id))
       AND ($12 = '' OR j.scheduled_date >= $12::date)
       AND ($13 = '' OR j.scheduled_date <= $13::date)
       AND ($14::boolean IS NOT TRUE OR coalesce(rf.starred, false))
       AND (
         $15 = ''
         OR j.title ILIKE $16
         OR coalesce(j.description, '') ILIKE $16
         OR coalesce(j.po_number, '') ILIKE $16
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $16
         OR coalesce(cc.phone, '') ILIKE $16
       )`, [
        userId, companyId, req.auth.role, req.auth.memberId ?? null,
        archived, status === 'unassigned' ? 'all' : status, priority, category, source, workerUuid,
        unassignedOnly, dateFrom, dateTo, starred, search, like,
    ]);
    const items = [];
    for (const r of idRows)
        items.push(await mapJob(client, companyId, r.id, userId));
    const countsQ = await client.query(`SELECT
       count(*)::int AS all_n,
       count(*) FILTER (WHERE status = 'new')::int AS new_n,
       count(*) FILTER (WHERE status = 'assigned')::int AS assigned_n,
       count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_n,
       count(*) FILTER (WHERE status = 'completed')::int AS completed_n,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_n,
       count(*) FILTER (WHERE status <> 'cancelled' AND NOT EXISTS (
         SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id
       ))::int AS unassigned_n
     FROM jobs j
     WHERE j.company_id = $1
       AND ($2::text = 'field_worker' AND EXISTS (
         SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id AND ja.member_id = $3
       ) OR $2::text <> 'field_worker')
       AND (
         $4 = 'all'
         OR ($4 = 'active' AND j.archived_at IS NULL)
         OR ($4 = 'archived' AND j.archived_at IS NOT NULL)
       )`, [companyId, req.auth.role, req.auth.memberId ?? null, archived]);
    const c = countsQ.rows[0];
    res.json({
        items: items.filter(Boolean), page, pageSize, total: totalQ.rows[0].n,
        counts: {
            all: c.all_n, new: c.new_n, assigned: c.assigned_n, in_progress: c.in_progress_n,
            completed: c.completed_n, cancelled: c.cancelled_n, unassigned: c.unassigned_n,
        },
    });
}));
const jobBody = z.object({
    title: z.string().min(1),
    description: z.string().optional().default(''),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
    category: z.enum(['plumbing', 'electrical', 'hvac', 'general']).optional().default('plumbing'),
    customerId: z.string().uuid(),
    addressId: z.string().uuid().optional(),
    scheduledDate: z.string().nullish(),
    scheduledTime: z.string().nullish(),
    arrivalEndTime: z.string().nullish(),
    multiDay: z.boolean().optional().default(false),
    endDate: z.string().nullish(),
    estimatedDuration: z.number().optional().default(2),
    materials: z.array(z.string()).optional().default([]),
    assignedWorkerIds: z.array(z.string().uuid()).optional().default([]),
    ownerUserId: z.string().uuid().optional(),
    poNumber: z.string().nullish(),
    jobSource: z.string().nullish(),
    notesForTechs: z.string().nullish(),
    completionNotes: z.string().optional(),
    requiresFollowUp: z.boolean().optional().default(false),
    notifyTechs: z.boolean().optional().default(true),
    billingType: z.enum(['single_invoice', 'progress_billing', 'no_charge']).optional(),
    taxRate: z.number().optional().default(0),
    noteToCustomer: z.string().optional(),
    lineItems: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        total: z.number().optional(),
        taxable: z.boolean().optional(),
    })).optional().default([]),
});
jobsRouter.post('/', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const body = jobBody.parse(req.body);
    const companyId = req.auth.companyId;
    await assertPlanLimits(client, companyId, 'jobs');
    const cust = await client.query(`SELECT id FROM customers WHERE company_id = $1 AND id = $2`, [companyId, body.customerId]);
    if (!cust.rowCount)
        throw notFound('Customer');
    let addressId = body.addressId ?? null;
    if (!addressId) {
        const addr = await client.query(`SELECT id FROM addresses WHERE company_id = $1 AND customer_id = $2 ORDER BY is_default DESC LIMIT 1`, [companyId, body.customerId]);
        addressId = addr.rows[0]?.id ?? null;
    }
    const status = body.assignedWorkerIds.length ? 'assigned' : 'new';
    const job = await client.query(`INSERT INTO jobs (
       company_id, customer_id, address_id, title, description, status, priority, category,
       scheduled_date, scheduled_time, arrival_end_time, multi_day, end_date, estimated_duration_hours,
       po_number, job_source, notes_for_techs, completion_notes, requires_follow_up, notify_techs,
       billing_type, tax_rate, note_to_customer, created_by, owner_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING id`, [
        companyId, body.customerId, addressId, body.title, body.description, status, body.priority, body.category,
        body.scheduledDate || null, body.scheduledTime || null, body.arrivalEndTime || null, body.multiDay,
        body.endDate || null, body.estimatedDuration, body.poNumber ?? null, body.jobSource ?? null,
        body.notesForTechs ?? null, body.completionNotes ?? null, body.requiresFollowUp, body.notifyTechs,
        body.billingType ?? 'single_invoice', body.taxRate, body.noteToCustomer ?? null,
        req.auth.userId, body.ownerUserId ?? req.auth.userId,
    ]);
    const id = job.rows[0].id;
    for (const userId of body.assignedWorkerIds) {
        const mid = await memberIdForUser(client, companyId, userId);
        if (!mid)
            throw badRequest('Invalid worker');
        const leave = await client.query(`SELECT employment_status FROM worker_profiles WHERE member_id = $1`, [mid]);
        if (leave.rows[0]?.employment_status === 'on_leave')
            throw badRequest('Worker is on leave');
        await client.query(`INSERT INTO job_assignees (company_id, job_id, member_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [companyId, id, mid]);
        await notify(client, {
            companyId, userId, title: 'New Assignment',
            message: `You have been assigned: ${body.title}`,
            eventKey: 'job.assigned',
            entityType: 'job',
            entityId: id,
            linkPath: `/worker/jobs/${id}`,
            email: await memberWantsAssignmentEmail(client, companyId, userId),
        });
    }
    for (const m of body.materials) {
        await client.query(`INSERT INTO job_materials (company_id, job_id, name) VALUES ($1,$2,$3)`, [companyId, id, m]);
    }
    for (const li of body.lineItems) {
        await client.query(`INSERT INTO job_line_items (company_id, job_id, description, quantity, unit_price, total, taxable)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [companyId, id, li.description, li.quantity, li.unitPrice, li.total ?? li.quantity * li.unitPrice, li.taxable ?? true]);
    }
    if (body.scheduledDate) {
        const custMail = await customerEmailFor(client, companyId, body.customerId);
        const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
        if (custMail) {
            await sendTenantCrmEmail(client, {
                companyId,
                type: 'appointment',
                to: custMail.email,
                customerId: body.customerId,
                jobId: id,
                userId: req.auth.userId,
                vars: {
                    customerName: custMail.name,
                    companyName: company.rows[0]?.name ?? '',
                    jobTitle: body.title,
                    scheduledDate: body.scheduledDate,
                    scheduledTime: body.scheduledTime || '',
                },
                fallbackSubject: `Appointment: ${body.title}`,
                fallbackBody: `Dear ${custMail.name},\n\nYour appointment for ${body.title} is scheduled for ${body.scheduledDate}${body.scheduledTime ? ` at ${body.scheduledTime}` : ''}.`,
            });
        }
    }
    res.status(201).json(await mapJob(client, companyId, id, req.auth.userId));
}));
jobsRouter.post('/bulk', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const body = z.object({
        ids: z.array(z.string().uuid()).min(1).max(50),
        action: z.enum(['archive', 'restore', 'status']),
        status: z.enum(['new', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
    }).parse(req.body);
    if (body.action === 'status' && !body.status)
        throw badRequest('status is required');
    const companyId = req.auth.companyId;
    let n = 0;
    if (body.action === 'archive') {
        const r = await client.query(`UPDATE jobs SET archived_at = now(), archived_by = $3, updated_by = $3
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL`, [companyId, body.ids, req.auth.userId]);
        n = r.rowCount ?? 0;
    }
    else if (body.action === 'restore') {
        const r = await client.query(`UPDATE jobs SET archived_at = NULL, archived_by = NULL, updated_by = $3
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NOT NULL`, [companyId, body.ids, req.auth.userId]);
        n = r.rowCount ?? 0;
    }
    else {
        const r = await client.query(`UPDATE jobs SET status = $3, updated_by = $4,
         completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END
       WHERE company_id = $1 AND id = ANY($2::uuid[])`, [companyId, body.ids, body.status, req.auth.userId]);
        n = r.rowCount ?? 0;
    }
    res.json({ ok: true, updated: n });
}));
jobsRouter.post('/:id/archive', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const r = await client.query(`UPDATE jobs SET archived_at = now(), archived_by = $3, updated_by = $3
     WHERE company_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`, [req.auth.companyId, req.params.id, req.auth.userId]);
    if (!r.rowCount)
        throw notFound('Job');
    await audit(client, {
        actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'job.archive',
        entityType: 'job', entityId: req.params.id,
    });
    res.json(await mapJob(client, req.auth.companyId, req.params.id, req.auth.userId));
}));
jobsRouter.post('/:id/restore', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const r = await client.query(`UPDATE jobs SET archived_at = NULL, archived_by = NULL, updated_by = $3
     WHERE company_id = $1 AND id = $2 AND archived_at IS NOT NULL RETURNING id`, [req.auth.companyId, req.params.id, req.auth.userId]);
    if (!r.rowCount)
        throw notFound('Job');
    await audit(client, {
        actorUserId: req.auth.userId, companyId: req.auth.companyId, action: 'job.restore',
        entityType: 'job', entityId: req.params.id,
    });
    res.json(await mapJob(client, req.auth.companyId, req.params.id, req.auth.userId));
}));
jobsRouter.get('/:id', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
    if (req.auth.role === 'field_worker') {
        await assertAssigned(client, req.params.id, req.auth.memberId);
    }
    const job = await mapJob(client, req.auth.companyId, req.params.id, req.auth.userId);
    if (!job)
        throw notFound('Job');
    res.json(job);
}));
jobsRouter.patch('/:id', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const body = jobBody.partial().extend({ customerId: z.string().uuid().optional() }).parse(req.body);
    const companyId = req.auth.companyId;
    const existing = await mapJob(client, companyId, req.params.id);
    if (!existing)
        throw notFound('Job');
    await client.query(`UPDATE jobs SET
       title = coalesce($3, title),
       description = coalesce($4, description),
       priority = coalesce($5, priority),
       category = coalesce($6, category),
       scheduled_date = coalesce($7, scheduled_date),
       scheduled_time = coalesce($8, scheduled_time),
       arrival_end_time = coalesce($9, arrival_end_time),
       estimated_duration_hours = coalesce($10, estimated_duration_hours),
       po_number = coalesce($11, po_number),
       job_source = coalesce($12, job_source),
       notes_for_techs = coalesce($13, notes_for_techs),
       tax_rate = coalesce($14, tax_rate),
       billing_type = coalesce($15, billing_type),
       owner_user_id = CASE WHEN $16::boolean THEN owner_user_id ELSE $17::uuid END,
       updated_by = $18
     WHERE company_id = $1 AND id = $2`, [
        companyId, req.params.id, body.title ?? null, body.description ?? null, body.priority ?? null,
        body.category ?? null,
        body.scheduledDate || null,
        body.scheduledTime || null,
        body.arrivalEndTime || null,
        body.estimatedDuration ?? null, body.poNumber || null, body.jobSource || null, body.notesForTechs ?? null,
        body.taxRate ?? null, body.billingType ?? null,
        body.ownerUserId === undefined, body.ownerUserId ?? null, req.auth.userId,
    ]);
    res.json(await mapJob(client, companyId, req.params.id, req.auth.userId));
}));
jobsRouter.delete('/:id', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const r = await client.query(`DELETE FROM jobs WHERE company_id = $1 AND id = $2 RETURNING id`, [req.auth.companyId, req.params.id]);
    if (!r.rowCount)
        throw notFound('Job');
    res.json({ ok: true });
}));
jobsRouter.post('/:id/status', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
    const body = z.object({ status: z.enum(['new', 'assigned', 'in_progress', 'completed', 'cancelled']) }).parse(req.body);
    const companyId = req.auth.companyId;
    if (req.auth.role === 'field_worker') {
        await assertAssigned(client, req.params.id, req.auth.memberId);
        if (!['in_progress', 'completed'].includes(body.status))
            throw badRequest('Invalid status transition');
    }
    const job = await mapJob(client, companyId, req.params.id);
    if (!job)
        throw notFound('Job');
    await client.query(`UPDATE jobs SET status = $3, completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END
     WHERE company_id = $1 AND id = $2`, [companyId, req.params.id, body.status]);
    if (body.status === 'completed') {
        await notifyCompanyAdmins(client, companyId, 'Job Completed', `${job.title} was marked completed`, 'success', {
            eventKey: 'job.completed', entityType: 'job', entityId: req.params.id, linkPath: `/admin/jobs/${req.params.id}`,
            emailAlways: true,
        });
        for (const uid of job.assignedWorkerIds ?? []) {
            await client.query(`UPDATE worker_profiles wp SET jobs_completed = jobs_completed + 1
         FROM company_members m WHERE m.id = wp.member_id AND m.user_id = $1 AND wp.company_id = $2`, [uid, companyId]);
        }
    }
    else if (body.status === 'cancelled') {
        await notifyCompanyAdmins(client, companyId, 'Job Cancelled', `${job.title} was cancelled`, 'warning', {
            eventKey: 'job.cancelled', entityType: 'job', entityId: req.params.id, linkPath: `/admin/jobs/${req.params.id}`,
        });
    }
    await audit(client, {
        actorUserId: req.auth.userId, companyId, action: 'job.status',
        entityType: 'job', entityId: req.params.id, metadata: { status: body.status },
    });
    res.json(await mapJob(client, companyId, req.params.id));
}));
jobsRouter.post('/:id/assignees', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const body = z.object({ workerId: z.string().uuid() }).parse(req.body);
    const companyId = req.auth.companyId;
    const job = await mapJob(client, companyId, req.params.id);
    if (!job)
        throw notFound('Job');
    const mid = await memberIdForUser(client, companyId, body.workerId);
    if (!mid)
        throw badRequest('Invalid worker');
    const leave = await client.query(`SELECT employment_status FROM worker_profiles WHERE member_id = $1`, [mid]);
    if (leave.rows[0]?.employment_status === 'on_leave')
        throw badRequest('Worker is on leave');
    await client.query(`INSERT INTO job_assignees (company_id, job_id, member_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [companyId, req.params.id, mid]);
    if (job.status === 'new') {
        await client.query(`UPDATE jobs SET status = 'assigned' WHERE id = $1`, [req.params.id]);
    }
    await notify(client, {
        companyId, userId: body.workerId, title: 'New Assignment', message: `You have been assigned: ${job.title}`,
        eventKey: 'job.assigned', entityType: 'job', entityId: req.params.id, linkPath: `/worker/jobs/${req.params.id}`,
        email: await memberWantsAssignmentEmail(client, companyId, body.workerId),
    });
    res.json(await mapJob(client, companyId, req.params.id));
}));
jobsRouter.post('/:id/notes', requireRole('admin', 'field_worker'), tenantRoute(async (req, res, client) => {
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    if (req.auth.role === 'field_worker')
        await assertAssigned(client, req.params.id, req.auth.memberId);
    const job = await mapJob(client, req.auth.companyId, req.params.id);
    if (!job)
        throw notFound('Job');
    await client.query(`INSERT INTO job_notes (company_id, job_id, author_id, body) VALUES ($1,$2,$3,$4)`, [req.auth.companyId, req.params.id, req.auth.userId, body.body]);
    res.json(await mapJob(client, req.auth.companyId, req.params.id));
}));
jobsRouter.put('/:id/line-items', requireRole('admin'), requirePermission('jobs.write'), tenantRoute(async (req, res, client) => {
    const body = z.object({
        items: z.array(z.object({
            description: z.string(),
            quantity: z.number(),
            unitPrice: z.number(),
            total: z.number().optional(),
            taxable: z.boolean().optional(),
        })),
    }).parse(req.body);
    const companyId = req.auth.companyId;
    const job = await mapJob(client, companyId, req.params.id);
    if (!job)
        throw notFound('Job');
    await client.query(`DELETE FROM job_line_items WHERE job_id = $1`, [req.params.id]);
    for (const li of body.items) {
        await client.query(`INSERT INTO job_line_items (company_id, job_id, description, quantity, unit_price, total, taxable)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [companyId, req.params.id, li.description, li.quantity, li.unitPrice, li.total ?? li.quantity * li.unitPrice, li.taxable ?? true]);
    }
    res.json(await mapJob(client, companyId, req.params.id));
}));
//# sourceMappingURL=jobs.routes.js.map