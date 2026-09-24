import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { notifyByPermission } from '../../utils/helpers.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest } from '../../utils/errors.js';
import { nextNumber, parsePage, pageResult } from '../../utils/helpers.js';
import { audit } from '../../utils/audit.js';
import { customerEmailFor, sendTenantCrmEmail } from '../../services/tenantCrmEmail.js';
import { buildInvoicePdf } from '../../services/invoice-pdf.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('invoices.read'));

async function mapInvoice(client: import('pg').PoolClient, companyId: string, id: string) {
  const { rows } = await client.query(
    `SELECT i.*,
       cc.first_name, cc.last_name
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1 AND i.id = $2`,
    [companyId, id],
  );
  const i = rows[0];
  if (!i) return null;
  const items = (await client.query(
    `SELECT description, quantity, unit_price, total FROM invoice_line_items WHERE invoice_id = $1`,
    [id],
  )).rows.map((r) => ({
    description: r.description, quantity: Number(r.quantity), unitPrice: Number(r.unit_price), total: Number(r.total),
  }));
  return {
    id: i.id,
    invoiceNumber: i.invoice_number,
    jobId: i.job_id,
    companyId: i.company_id,
    customerId: i.customer_id,
    customerName: `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim(),
    amount: Number(i.subtotal),
    tax: Number(i.tax),
    total: Number(i.total),
    status: i.status,
    createdAt: i.created_at.toISOString().slice(0, 10),
    dueDate: i.due_date.toISOString().slice(0, 10),
    items,
  };
}

invoicesRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? 'all');
  const like = `%${search}%`;
  const { page, pageSize, offset } = parsePage(req.query);
  const { rows } = await client.query(
    `SELECT i.id
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1
       AND ($2 = 'all' OR i.status = $2)
       AND (
         $3 = ''
         OR i.invoice_number ILIKE $4
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $4
       )
     ORDER BY i.created_at DESC
     LIMIT $5 OFFSET $6`,
    [companyId, status, search, like, pageSize, offset],
  );
  const total = await client.query(
    `SELECT count(*)::int AS n
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT first_name, last_name FROM customer_contacts
       WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1
       AND ($2 = 'all' OR i.status = $2)
       AND (
         $3 = ''
         OR i.invoice_number ILIKE $4
         OR coalesce(cc.first_name || ' ' || cc.last_name, '') ILIKE $4
       )`,
    [companyId, status, search, like],
  );
  const items = [];
  for (const r of rows) items.push(await mapInvoice(client, companyId, r.id));
  res.json({ items: items.filter(Boolean), page, pageSize, total: total.rows[0].n });
}));

invoicesRouter.get('/:id', tenantRoute(async (req, res, client) => {
  const inv = await mapInvoice(client, req.auth.companyId!, req.params.id);
  if (!inv) throw notFound('Invoice');
  res.json(inv);
}));

invoicesRouter.get('/:id/pdf', tenantRoute(async (req, res, client) => {
  const pdf = await buildInvoicePdf(client, req.auth.companyId!, req.params.id);
  if (!pdf) throw notFound('Invoice');
  const download = String(req.query.download ?? '') === '1';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${pdf.filename}"`);
  res.send(pdf.content);
}));

invoicesRouter.patch('/:id', requirePermission('invoices.write'), tenantRoute(async (req, res, client) => {
  const body = z.object({
    status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    items: z.array(z.object({
      description: z.string().trim().min(1).max(300),
      quantity: z.coerce.number().positive(),
      unitPrice: z.coerce.number().min(0),
    })).min(1).optional(),
  }).parse(req.body ?? {});
  if (!body.status && !body.items && !body.dueDate) throw badRequest('Nothing to update');
  const companyId = req.auth.companyId!;
  const existing = await mapInvoice(client, companyId, req.params.id);
  if (!existing) throw notFound('Invoice');

  if (body.items || body.dueDate) {
    if (existing.status === 'paid') throw badRequest('Paid invoices cannot be edited');
  }

  if (body.items) {
    const lines = body.items.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      total: +(li.quantity * li.unitPrice).toFixed(2),
    }));
    const subtotal = lines.reduce((s, r) => s + r.total, 0);
    let taxRate = 0;
    if (existing.jobId) {
      const job = await client.query(
        `SELECT tax_rate FROM jobs WHERE company_id = $1 AND id = $2`,
        [companyId, existing.jobId],
      );
      taxRate = Number(job.rows[0]?.tax_rate ?? 0);
    } else if (Number(existing.amount) > 0) {
      taxRate = (Number(existing.tax) / Number(existing.amount)) * 100;
    }
    const tax = +(subtotal * (taxRate / 100)).toFixed(2);
    await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [req.params.id]);
    for (const li of lines) {
      await client.query(
        `INSERT INTO invoice_line_items (company_id, invoice_id, description, quantity, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [companyId, req.params.id, li.description, li.quantity, li.unit_price, li.total],
      );
    }
    await client.query(
      `UPDATE invoices SET subtotal = $3, tax = $4, total = $5, due_date = coalesce($6::date, due_date)
       WHERE company_id = $1 AND id = $2`,
      [companyId, req.params.id, subtotal, tax, subtotal + tax, body.dueDate ?? null],
    );
  } else if (body.dueDate) {
    await client.query(
      `UPDATE invoices SET due_date = $3 WHERE company_id = $1 AND id = $2`,
      [companyId, req.params.id, body.dueDate],
    );
  }

  if (!body.status) {
    res.json(await mapInvoice(client, companyId, req.params.id));
    return;
  }

  const r = await client.query(
    `UPDATE invoices SET status = $3, paid_at = CASE WHEN $3 = 'paid' THEN now() ELSE paid_at END
     WHERE company_id = $1 AND id = $2 RETURNING id`,
    [companyId, req.params.id, body.status],
  );
  if (!r.rowCount) throw notFound('Invoice');
  if (body.status === 'paid') {
    await audit(client, {
      actorUserId: req.auth.userId, companyId, action: 'invoice.paid',
      entityType: 'invoice', entityId: req.params.id,
    });
    await notifyByPermission(client, companyId, 'invoices.read', {
      title: 'Invoice paid', message: `Invoice was marked paid`, type: 'success',
      eventKey: 'invoice.paid', entityType: 'invoice', entityId: req.params.id, linkPath: '/admin/invoices', emailPref: 'invoices',
    });
  } else if (body.status === 'sent') {
    await notifyByPermission(client, companyId, 'invoices.read', {
      title: 'Invoice sent', message: 'An invoice was sent to the customer',
      eventKey: 'invoice.sent', entityType: 'invoice', entityId: req.params.id, linkPath: '/admin/invoices', emailPref: 'invoices',
    });
    const inv = await mapInvoice(client, companyId, req.params.id);
    if (inv?.customerId) {
      const cust = await customerEmailFor(client, companyId, inv.customerId);
      const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
      if (cust) {
        const pdf = await buildInvoicePdf(client, companyId, req.params.id);
        await sendTenantCrmEmail(client, {
          companyId,
          type: 'invoice',
          to: cust.email,
          customerId: inv.customerId,
          userId: req.auth.userId,
          vars: {
            customerName: cust.name,
            companyName: company.rows[0]?.name ?? '',
            invoiceNumber: inv.invoiceNumber,
            amount: inv.total.toFixed(2),
            total: inv.total.toFixed(2),
            dueDate: inv.dueDate ?? '',
          },
          fallbackSubject: `Invoice ${inv.invoiceNumber}`,
          fallbackBody: `Dear ${cust.name},\n\nPlease find invoice ${inv.invoiceNumber} for $${inv.total.toFixed(2)}. The invoice PDF is attached.`,
          attachments: pdf ? [pdf] : undefined,
        });
      }
    }
  } else if (body.status === 'overdue') {
    await notifyByPermission(client, companyId, 'invoices.read', {
      title: 'Invoice overdue', message: 'An invoice is overdue', type: 'warning',
      eventKey: 'invoice.overdue', entityType: 'invoice', entityId: req.params.id, linkPath: '/admin/invoices', emailPref: 'invoices',
    });
  }
  res.json(await mapInvoice(client, companyId, req.params.id));
}));

export const jobInvoiceRouter = Router({ mergeParams: true });
jobInvoiceRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('invoices.write'));

jobInvoiceRouter.post('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const jobId = req.params.id;
  const body = z.object({
    items: z.array(z.object({
      description: z.string().trim().min(1).max(300),
      quantity: z.coerce.number().positive(),
      unitPrice: z.coerce.number().min(0),
    })).min(1).optional(),
  }).parse(req.body ?? {});
  const job = await client.query(
    `SELECT * FROM jobs WHERE company_id = $1 AND id = $2`,
    [companyId, jobId],
  );
  if (!job.rowCount) throw notFound('Job');
  const j = job.rows[0];
  let lines: { description: string; quantity: number; unit_price: number; total: number }[];
  if (body.items?.length) {
    lines = body.items.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      total: +(li.quantity * li.unitPrice).toFixed(2),
    }));
  } else {
    const existing = await client.query(`SELECT * FROM job_line_items WHERE job_id = $1`, [jobId]);
    if (!existing.rowCount) throw badRequest('Add at least one line item');
    lines = existing.rows.map((r: { description: string; quantity: string; unit_price: string; total: string }) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
      total: Number(r.total),
    }));
  }
  const subtotal = lines.reduce((s, r) => s + Number(r.total), 0);
  const tax = +(subtotal * (Number(j.tax_rate) / 100)).toFixed(2);
  const number = await nextNumber(client, companyId, 'invoice');
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const inv = await client.query(
    `INSERT INTO invoices (company_id, customer_id, job_id, invoice_number, status, subtotal, tax, total, due_date, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9) RETURNING id`,
    [companyId, j.customer_id, jobId, number, subtotal, tax, subtotal + tax, due.toISOString().slice(0, 10), req.auth.userId],
  );
  for (const li of lines) {
    await client.query(
      `INSERT INTO invoice_line_items (company_id, invoice_id, description, quantity, unit_price, total)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, inv.rows[0].id, li.description, li.quantity, li.unit_price, li.total],
    );
  }
  await client.query(`UPDATE jobs SET invoice_id = $2 WHERE id = $1`, [jobId, inv.rows[0].id]);
  await notifyByPermission(client, companyId, 'invoices.read', {
    title: 'Invoice created', message: `${number} was created from a job`,
    eventKey: 'invoice.created', entityType: 'invoice', entityId: inv.rows[0].id, linkPath: '/admin/invoices', emailPref: 'invoices',
  });
  res.status(201).json(await mapInvoice(client, companyId, inv.rows[0].id));
}));
