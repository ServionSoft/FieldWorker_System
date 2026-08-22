import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { notFound, badRequest } from '../../utils/errors.js';
import { sendTenantCrmEmail } from '../../services/tenantCrmEmail.js';
import { TENANT_TEMPLATE_TYPES } from '../../services/email.js';
import { requireTwilio, fromNumber, webhookBase, twilioConfigured } from '../../services/twilio.js';
import { toE164 } from '../../utils/phone.js';
import { parsePage, pageResult } from '../../utils/helpers.js';

export const commsRouter = Router();
commsRouter.use(requireAuth, requireTenant, requireRole('admin', 'field_worker'), requirePermission('communications.access'));

function map(r: Record<string, unknown>, userName?: string) {
  return {
    id: r.id,
    companyId: r.company_id,
    type: r.type,
    direction: r.direction,
    status: r.status,
    fromNumber: r.from_number,
    toNumber: r.to_number,
    customerId: r.customer_id,
    jobId: r.job_id,
    estimateId: r.estimate_id,
    userId: r.user_id,
    userName,
    body: r.body,
    durationSec: r.duration_sec,
    recordingUrl: r.recording_file_id,
    read: r.read,
    timestamp: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

commsRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  const { customerId, jobId, estimateId, type } = req.query;
  const { rows } = await client.query(
    `SELECT c.*, u.name AS user_name
     FROM communications c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.company_id = $1
       AND ($2::uuid IS NULL OR c.customer_id = $2)
       AND ($3::uuid IS NULL OR c.job_id = $3)
       AND ($4::uuid IS NULL OR c.estimate_id = $4)
       AND ($5::text IS NULL OR c.type = $5)
     ORDER BY c.created_at DESC`,
    [
      companyId,
      (customerId as string) || null,
      (jobId as string) || null,
      (estimateId as string) || null,
      (type as string) || null,
    ],
  );
  const { page, pageSize } = parsePage(req.query);
  res.json(pageResult(rows.map((r) => map(r, r.user_name)), page, pageSize));
}));

commsRouter.post('/', tenantRoute(async (req, res, client) => {
  const body = z.object({
    type: z.enum(['call', 'sms', 'voicemail', 'mms', 'email', 'note']),
    direction: z.enum(['inbound', 'outbound']),
    status: z.string().min(1),
    fromNumber: z.string().optional().default(''),
    toNumber: z.string().optional().default(''),
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
    body: z.string().optional(),
    durationSec: z.number().optional(),
  }).parse(req.body);
  const created = await client.query(
    `INSERT INTO communications (
       company_id, type, direction, status, from_number, to_number,
       customer_id, job_id, estimate_id, user_id, body, duration_sec, read
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, $13)
     RETURNING *`,
    [
      req.auth.companyId, body.type, body.direction, body.status, body.fromNumber, body.toNumber,
      body.customerId ?? null, body.jobId ?? null, body.estimateId ?? null, req.auth.userId,
      body.body ?? null, body.durationSec ?? null, body.direction === 'outbound',
    ],
  );
  res.status(201).json(map(created.rows[0]));
}));

commsRouter.get('/twilio', tenantRoute(async (req, res, client) => {
  const company = await client.query(`SELECT twilio_number, phone FROM companies WHERE id = $1`, [req.auth.companyId]);
  res.json({
    configured: twilioConfigured(),
    fromNumber: company.rows[0]?.twilio_number || null,
    companyPhone: company.rows[0]?.phone || null,
  });
}));

commsRouter.post('/sms', tenantRoute(async (req, res, client) => {
  const body = z.object({
    to: z.string().min(5),
    body: z.string().min(1).max(1600),
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
  }).parse(req.body);
  const company = await client.query(`SELECT twilio_number FROM companies WHERE id = $1`, [req.auth.companyId]);
  const from = fromNumber(company.rows[0]?.twilio_number);
  const to = toE164(body.to);
  if (!to) throw badRequest('Invalid destination phone number');
  const clientTwilio = requireTwilio();
  const msg = await clientTwilio.messages.create({
    from,
    to,
    body: body.body,
    statusCallback: `${webhookBase()}/api/webhooks/twilio/status`,
  });
  const created = await client.query(
    `INSERT INTO communications (
       company_id, type, direction, status, from_number, to_number,
       customer_id, job_id, estimate_id, user_id, body, twilio_sid, read
     ) VALUES ($1,'sms','outbound',$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     RETURNING *`,
    [
      req.auth.companyId, msg.status || 'sent', from, to,
      body.customerId ?? null, body.jobId ?? null, body.estimateId ?? null,
      req.auth.userId, body.body, msg.sid,
    ],
  );
  res.status(201).json(map(created.rows[0]));
}));

commsRouter.post('/call', tenantRoute(async (req, res, client) => {
  const body = z.object({
    to: z.string().min(5),
    callbackNumber: z.string().min(5),
    notes: z.string().optional(),
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
  }).parse(req.body);
  const company = await client.query(`SELECT twilio_number FROM companies WHERE id = $1`, [req.auth.companyId]);
  const from = fromNumber(company.rows[0]?.twilio_number);
  const customerTo = toE164(body.to);
  const callback = toE164(body.callbackNumber);
  if (!customerTo || !callback) throw badRequest('Invalid phone number');
  const created = await client.query(
    `INSERT INTO communications (
       company_id, type, direction, status, from_number, to_number,
       customer_id, job_id, estimate_id, user_id, body, twilio_sid, read
     ) VALUES ($1,'call','outbound','queued',$2,$3,$4,$5,$6,$7,$8,null,true)
     RETURNING *`,
    [
      req.auth.companyId, from, customerTo,
      body.customerId ?? null, body.jobId ?? null, body.estimateId ?? null,
      req.auth.userId, body.notes || `Click-to-call ${customerTo}`,
    ],
  );
  const commId = created.rows[0].id;
  const twilioClient = requireTwilio();
  const call = await twilioClient.calls.create({
    from,
    to: callback,
    url: `${webhookBase()}/api/webhooks/twilio/voice/connect/${commId}`,
    statusCallback: `${webhookBase()}/api/webhooks/twilio/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });
  await client.query(`UPDATE communications SET twilio_sid = $2, status = $3 WHERE id = $1`, [commId, call.sid, call.status || 'queued']);
  res.status(201).json({ ...map({ ...created.rows[0], twilio_sid: call.sid, status: call.status || 'queued' }) });
}));

commsRouter.post('/send-template', tenantRoute(async (req, res, client) => {
  const body = z.object({
    templateId: z.string().uuid(),
    customerId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
    toEmail: z.string().email().optional(),
  }).parse(req.body);
  const companyId = req.auth.companyId!;
  const tpl = await client.query(
    `SELECT * FROM email_templates WHERE company_id = $1 AND id = $2`,
    [companyId, body.templateId],
  );
  if (!tpl.rowCount) throw notFound('Template');
  const type = z.enum(TENANT_TEMPLATE_TYPES).parse(tpl.rows[0].type);
  const cust = await client.query(
    `SELECT c.id, cc.email, cc.first_name, cc.last_name, cc.phone
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = c.id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE c.company_id = $1 AND c.id = $2`,
    [companyId, body.customerId],
  );
  if (!cust.rowCount) throw notFound('Customer');
  const to = body.toEmail || cust.rows[0].email;
  if (!to) throw notFound('Customer email');
  const company = await client.query(`SELECT name, phone FROM companies WHERE id = $1`, [companyId]);
  const name = `${cust.rows[0].first_name ?? ''} ${cust.rows[0].last_name ?? ''}`.trim() || 'Customer';
  const result = await sendTenantCrmEmail(client, {
    companyId,
    type,
    to,
    customerId: body.customerId,
    jobId: body.jobId,
    estimateId: body.estimateId,
    userId: req.auth.userId,
    template: { subject: tpl.rows[0].subject, body: tpl.rows[0].body },
    vars: {
      customerName: name,
      companyName: company.rows[0]?.name ?? '',
      phone: cust.rows[0].phone ?? '',
    },
  });
  if (!result.sent) {
    const detail = result.error === 'not_configured'
      ? 'Could not send via tenant SMTP. Configure Company email (SMTP) — FieldPro platform SMTP is never used for customer mail.'
      : `Could not send via tenant SMTP: ${result.error}`;
    throw badRequest(detail);
  }
  res.status(201).json({ ...map(result.communication), channel: 'tenant' });
}));

commsRouter.post('/:id/read', tenantRoute(async (req, res, client) => {
  const r = await client.query(
    `UPDATE communications SET read = true WHERE company_id = $1 AND id = $2 RETURNING id`,
    [req.auth.companyId, req.params.id],
  );
  if (!r.rowCount) throw notFound('Communication');
  res.json({ ok: true });
}));

commsRouter.post('/read-all', tenantRoute(async (req, res, client) => {
  const filter = z.object({
    customerId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
  }).parse(req.body ?? {});
  await client.query(
    `UPDATE communications SET read = true
     WHERE company_id = $1
       AND ($2::uuid IS NULL OR customer_id = $2)
       AND ($3::uuid IS NULL OR job_id = $3)
       AND ($4::uuid IS NULL OR estimate_id = $4)`,
    [req.auth.companyId, filter.customerId ?? null, filter.jobId ?? null, filter.estimateId ?? null],
  );
  res.json({ ok: true });
}));
