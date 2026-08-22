import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireFeature, requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';

export const opsRouter = Router();
opsRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('dispatch.access', 'reports.view', 'jobs.read'));

opsRouter.get('/calendar', requireFeature('calendar'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const from = String(req.query.from ?? '2000-01-01');
  const to = String(req.query.to ?? '2100-01-01');
  const jobs = await client.query(
    `SELECT j.id, j.title, j.status, j.scheduled_date, j.scheduled_time, j.estimated_duration_hours, j.category,
            cc.first_name, cc.last_name,
            coalesce(array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL), '{}') AS worker_ids
     FROM jobs j
     LEFT JOIN LATERAL (SELECT * FROM customer_contacts WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1) cc ON true
     LEFT JOIN job_assignees ja ON ja.job_id = j.id
     LEFT JOIN company_members m ON m.id = ja.member_id
     WHERE j.company_id = $1 AND j.scheduled_date BETWEEN $2 AND $3
     GROUP BY j.id, cc.first_name, cc.last_name`,
    [companyId, from, to],
  );
  const estimates = await client.query(
    `SELECT e.id, e.estimate_number, e.status, e.requested_on, e.category, cc.first_name, cc.last_name
     FROM estimates e
     LEFT JOIN LATERAL (SELECT * FROM customer_contacts WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1) cc ON true
     WHERE e.company_id = $1 AND e.status <> 'converted' AND coalesce(e.requested_on, e.created_at::date) BETWEEN $2 AND $3`,
    [companyId, from, to],
  );
  res.json({
    jobs: jobs.rows.map((j) => ({
      id: j.id, type: 'job', title: j.title, status: j.status,
      date: j.scheduled_date?.toISOString().slice(0, 10),
      time: j.scheduled_time ? String(j.scheduled_time).slice(0, 5) : undefined,
      duration: Number(j.estimated_duration_hours),
      category: j.category,
      customerName: `${j.first_name ?? ''} ${j.last_name ?? ''}`.trim(),
      workerIds: j.worker_ids,
    })),
    estimates: estimates.rows.map((e) => ({
      id: e.id, type: 'estimate', title: e.estimate_number, status: e.status,
      date: e.requested_on ? e.requested_on.toISOString().slice(0, 10) : undefined,
      category: e.category,
      customerName: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
    })),
  });
}));

opsRouter.get('/dispatch', requireFeature('dispatch'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const from = String(req.query.from ?? '2000-01-01');
  const to = String(req.query.to ?? '2100-01-01');
  const workers = await client.query(
    `SELECT m.user_id, u.name FROM worker_profiles wp
     JOIN company_members m ON m.id = wp.member_id
     JOIN users u ON u.id = m.user_id
     WHERE wp.company_id = $1 AND wp.employment_status = 'active'`,
    [companyId],
  );
  const jobs = await client.query(
    `SELECT j.id, j.title, j.status, j.scheduled_date, j.scheduled_time, j.estimated_duration_hours, j.category,
            cc.first_name, cc.last_name, m.user_id AS worker_id
     FROM jobs j
     LEFT JOIN LATERAL (SELECT * FROM customer_contacts WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1) cc ON true
     LEFT JOIN job_assignees ja ON ja.job_id = j.id
     LEFT JOIN company_members m ON m.id = ja.member_id
     WHERE j.company_id = $1 AND j.scheduled_date BETWEEN $2 AND $3`,
    [companyId, from, to],
  );
  res.json({
    workers: workers.rows.map((w) => ({ id: w.user_id, name: w.name })),
    events: jobs.rows.map((j) => ({
      id: j.id, type: 'job', title: `${j.first_name ?? ''} ${j.last_name ?? ''}`.trim(),
      status: j.status,
      date: j.scheduled_date?.toISOString().slice(0, 10),
      time: j.scheduled_time ? String(j.scheduled_time).slice(0, 5) : undefined,
      duration: Number(j.estimated_duration_hours),
      category: j.category,
      workerId: j.worker_id,
    })),
  });
}));

opsRouter.get('/dashboard', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const jobs = await client.query(`SELECT status, scheduled_date FROM jobs WHERE company_id = $1`, [companyId]);
  const workers = await client.query(
    `SELECT count(*) FILTER (WHERE employment_status = 'active')::int AS active FROM worker_profiles WHERE company_id = $1`,
    [companyId],
  );
  const inv = await client.query(
    `SELECT count(*) FILTER (WHERE quantity < min_stock)::int AS low FROM inventory_items WHERE company_id = $1`,
    [companyId],
  );
  const revenue = await client.query(
    `SELECT coalesce(sum(total),0) AS paid FROM invoices WHERE company_id = $1 AND status = 'paid'`,
    [companyId],
  );
  const byStatus = (s: string) => jobs.rows.filter((j) => j.status === s).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueFu = await client.query(
    `SELECT f.id, f.title, f.due_date, f.customer_id,
            coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS customer_name
     FROM follow_ups f
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts WHERE customer_id = f.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE f.company_id = $1 AND f.done = false AND f.due_date IS NOT NULL AND f.due_date < current_date
     ORDER BY f.due_date ASC LIMIT 8`,
    [companyId],
  );
  const dueTodayFu = await client.query(
    `SELECT f.id, f.title, f.due_date, f.customer_id,
            coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS customer_name
     FROM follow_ups f
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts WHERE customer_id = f.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE f.company_id = $1 AND f.done = false AND f.due_date = current_date
     ORDER BY f.title ASC LIMIT 8`,
    [companyId],
  );
  const unpaid = await client.query(
    `SELECT i.id, i.invoice_number, i.total, i.due_date, i.status,
            coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS customer_name
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1 AND i.status IN ('sent', 'overdue', 'draft')
     ORDER BY i.due_date ASC LIMIT 8`,
    [companyId],
  );
  const leads = await client.query(
    `SELECT count(*)::int AS n FROM customers WHERE company_id = $1 AND status = 'lead'`,
    [companyId],
  );
  res.json({
    activeJobs: byStatus('in_progress'),
    pendingJobs: byStatus('new') + byStatus('assigned'),
    completedJobs: byStatus('completed'),
    cancelledJobs: byStatus('cancelled'),
    lowStock: inv.rows[0].low,
    activeWorkers: workers.rows[0].active,
    revenue: Number(revenue.rows[0].paid),
    jobStatus: [
      { status: 'New', count: byStatus('new') },
      { status: 'Assigned', count: byStatus('assigned') },
      { status: 'In Progress', count: byStatus('in_progress') },
      { status: 'Completed', count: byStatus('completed') },
      { status: 'Cancelled', count: byStatus('cancelled') },
    ],
    todayJobCount: jobs.rows.filter((j) => j.scheduled_date && j.scheduled_date.toISOString().slice(0, 10) === today).length,
    overdueFollowUps: overdueFu.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date?.toISOString().slice(0, 10),
      customerId: r.customer_id, customerName: r.customer_name,
    })),
    dueTodayFollowUps: dueTodayFu.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date?.toISOString().slice(0, 10),
      customerId: r.customer_id, customerName: r.customer_name,
    })),
    unpaidInvoices: unpaid.rows.map((r) => ({
      id: r.id, invoiceNumber: r.invoice_number, total: Number(r.total),
      dueDate: r.due_date?.toISOString().slice(0, 10), status: r.status, customerName: r.customer_name,
    })),
    leadCount: leads.rows[0].n,
  });
}));

opsRouter.get('/reports', requireFeature('reports'), tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const jobs = await client.query(`SELECT status FROM jobs WHERE company_id = $1`, [companyId]);
  const workers = await client.query(
    `SELECT u.name, wp.jobs_completed, wp.rating
     FROM worker_profiles wp JOIN company_members m ON m.id = wp.member_id JOIN users u ON u.id = m.user_id
     WHERE wp.company_id = $1 AND wp.employment_status = 'active'`,
    [companyId],
  );
  const revenue = await client.query(
    `SELECT coalesce(sum(total),0) AS paid FROM invoices WHERE company_id = $1 AND status = 'paid'`,
    [companyId],
  );
  const byStatus = (s: string) => jobs.rows.filter((j) => j.status === s).length;
  const avgRating = workers.rows.length
    ? workers.rows.reduce((s, w) => s + Number(w.rating), 0) / workers.rows.length
    : 0;
  res.json({
    totalJobs: jobs.rows.length,
    completed: byStatus('completed'),
    revenue: Number(revenue.rows[0].paid),
    avgRating: Number(avgRating.toFixed(1)),
    jobDistribution: [
      { name: 'New', value: byStatus('new') },
      { name: 'Assigned', value: byStatus('assigned') },
      { name: 'In Progress', value: byStatus('in_progress') },
      { name: 'Completed', value: byStatus('completed') },
      { name: 'Cancelled', value: byStatus('cancelled') },
    ],
    workerEfficiency: workers.rows.map((w) => ({
      name: String(w.name).split(' ')[0],
      completed: w.jobs_completed,
      rating: Number(w.rating) * 20,
    })),
  });
}));

export const searchRouter = Router();
searchRouter.use(
  requireAuth,
  requireTenant,
  requireRole('admin', 'field_worker'),
  requirePermission(
    'customers.read', 'jobs.read', 'estimates.read', 'invoices.read',
    'workers.manage', 'documents.access', 'communications.access',
  ),
);

searchRouter.get('/search', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ customers: [], jobs: [], estimates: [], invoices: [], workers: [], documents: [], communications: [] });
    return;
  }
  const like = `%${q}%`;
  const phone = q.replace(/\D/g, '').slice(-10);
  const have = new Set(req.auth.permissions ?? []);
  const empty = { rows: [] as Record<string, unknown>[] };
  const customers = have.has('customers.read') ? await client.query(
    `SELECT c.id,
            coalesce(cc.first_name || ' ' || cc.last_name, 'Customer') AS name,
            cc.email, cc.phone
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT first_name, last_name, email, phone FROM customer_contacts
       WHERE customer_id = c.id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE c.company_id = $1 AND c.archived_at IS NULL
       AND (
         coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $2
         OR coalesce(cc.email, '') ILIKE $2
         OR coalesce(cc.phone, '') ILIKE $2
         OR ($3 <> '' AND right(regexp_replace(coalesce(cc.phone, ''), '\\D', '', 'g'), 10) = $3)
       )
     ORDER BY c.updated_at DESC
     LIMIT 8`,
    [companyId, like, phone],
  ) : empty;
  const jobs = have.has('jobs.read') ? await client.query(
    `SELECT j.id, j.title, coalesce(cc.first_name || ' ' || cc.last_name, '') AS customer_name
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = j.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE j.company_id = $1 AND j.archived_at IS NULL AND (
         j.title ILIKE $2
         OR coalesce(j.description, '') ILIKE $2
         OR coalesce(j.po_number, '') ILIKE $2
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $2
       )
       AND (
         $3::text <> 'field_worker'
         OR EXISTS (SELECT 1 FROM job_assignees ja WHERE ja.job_id = j.id AND ja.member_id = $4)
       )
     ORDER BY j.updated_at DESC
     LIMIT 8`,
    [companyId, like, req.auth.role, req.auth.memberId],
  ) : empty;
  const estimates = have.has('estimates.read') ? await client.query(
    `SELECT e.id, e.estimate_number, coalesce(cc.first_name || ' ' || cc.last_name, '') AS customer_name
     FROM estimates e
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE e.company_id = $1 AND (
         e.estimate_number ILIKE $2
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $2
       )
     ORDER BY e.updated_at DESC
     LIMIT 8`,
    [companyId, like],
  ) : empty;
  const invoices = have.has('invoices.read') ? await client.query(
    `SELECT i.id, i.invoice_number, coalesce(cc.first_name || ' ' || cc.last_name, '') AS customer_name
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1 AND (
         i.invoice_number ILIKE $2
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $2
       )
     ORDER BY i.created_at DESC
     LIMIT 8`,
    [companyId, like],
  ) : empty;
  const workers = have.has('workers.manage') || have.has('jobs.read')
    ? await client.query(
      `SELECT u.id, u.name, u.email, u.phone
       FROM worker_profiles wp
       JOIN company_members m ON m.id = wp.member_id
       JOIN users u ON u.id = m.user_id
       WHERE wp.company_id = $1
         AND (u.name ILIKE $2 OR coalesce(u.email, '') ILIKE $2 OR coalesce(u.phone, '') ILIKE $2)
       ORDER BY u.name
       LIMIT 8`,
      [companyId, like],
    )
    : { rows: [] as Record<string, unknown>[] };
  const documents = have.has('documents.access')
    ? await client.query(
      `SELECT d.id, f.original_name, d.job_id
       FROM documents d JOIN files f ON f.id = d.file_id
       WHERE d.company_id = $1 AND f.original_name ILIKE $2
       ORDER BY d.created_at DESC
       LIMIT 8`,
      [companyId, like],
    )
    : { rows: [] as Record<string, unknown>[] };
  const communications = have.has('communications.access')
    ? await client.query(
      `SELECT id, type, direction, coalesce(body, '') AS body, customer_id, job_id
       FROM communications
       WHERE company_id = $1 AND (
         coalesce(body, '') ILIKE $2 OR coalesce(from_number, '') ILIKE $2 OR coalesce(to_number, '') ILIKE $2
       )
       ORDER BY created_at DESC
       LIMIT 8`,
      [companyId, like],
    )
    : { rows: [] as Record<string, unknown>[] };
  res.json({
    customers: customers.rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone })),
    jobs: jobs.rows.map((r) => ({ id: r.id, title: r.title, customerName: r.customer_name })),
    estimates: estimates.rows.map((r) => ({ id: r.id, estimateNumber: r.estimate_number, customerName: r.customer_name })),
    invoices: invoices.rows.map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, customerName: r.customer_name })),
    workers: workers.rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone })),
    documents: documents.rows.map((r) => ({ id: r.id, name: r.original_name, jobId: r.job_id })),
    communications: communications.rows.map((r) => ({
      id: r.id, type: r.type, direction: r.direction, body: String(r.body).slice(0, 80),
      customerId: r.customer_id, jobId: r.job_id,
    })),
  });
}));
