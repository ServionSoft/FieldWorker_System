import type { PoolClient } from 'pg';
import {
  loadTenantTemplate,
  renderEmailTemplate,
  sendTenantEmail,
  type TenantTemplateType,
  type EmailAttachment,
} from './email.js';

export async function customerEmailFor(
  client: PoolClient,
  companyId: string,
  customerId: string,
) {
  const { rows } = await client.query(
    `SELECT cc.email, cc.first_name, cc.last_name
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = c.id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE c.company_id = $1 AND c.id = $2`,
    [companyId, customerId],
  );
  const r = rows[0];
  if (!r?.email) return null;
  return {
    email: r.email as string,
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Customer',
  };
}

export async function sendTenantCrmEmail(
  client: PoolClient,
  opts: {
    companyId: string;
    type: TenantTemplateType;
    to: string;
    vars: Record<string, string>;
    customerId?: string;
    jobId?: string;
    estimateId?: string;
    userId?: string;
    fallbackSubject?: string;
    fallbackBody?: string;
    template?: { subject: string; body: string };
    attachments?: EmailAttachment[];
  },
): Promise<{ sent: boolean; error?: string; communication: Record<string, unknown> }> {
  const tpl = opts.template ?? await loadTenantTemplate(client, opts.companyId, opts.type);
  const subject = tpl
    ? renderEmailTemplate(tpl.subject, opts.vars)
    : (opts.fallbackSubject || opts.vars.title || 'Message from your service company');
  let text = tpl
    ? renderEmailTemplate(tpl.body, opts.vars)
    : (opts.fallbackBody || opts.vars.message || '');
  if (opts.attachments?.length && text && !/attached|attachment|pdf/i.test(text)) {
    text = `${text.trim()}\n\nThe PDF is attached.`;
  }
  const result = await sendTenantEmail(client, opts.companyId, {
    to: opts.to,
    subject,
    text,
    attachments: opts.attachments,
  });
  const sent = result.ok;
  const created = await client.query(
    `INSERT INTO communications (
       company_id, type, direction, status, from_number, to_number,
       customer_id, job_id, estimate_id, user_id, body, read
     ) VALUES ($1,'email','outbound',$2,$3,$4,$5,$6,$7,$8,$9,true)
     RETURNING *`,
    [
      opts.companyId,
      sent ? 'sent' : 'queued',
      subject,
      opts.to,
      opts.customerId ?? null,
      opts.jobId ?? null,
      opts.estimateId ?? null,
      opts.userId ?? null,
      text,
    ],
  );
  return { sent, error: sent ? undefined : (result.error || 'not_configured'), communication: created.rows[0] };
}
