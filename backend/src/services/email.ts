import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptSecret } from '../utils/crypto.js';
import { pool } from '../db/pool.js';

export type SmtpConfig = {
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
  secure: boolean;
  fromName?: string | null;
  fromEmail: string;
  replyTo?: string | null;
};

export type EmailChannel = 'platform' | 'tenant';

export const PLATFORM_TEMPLATE_TYPES = [
  'password_reset',
  'welcome',
  'tenant_invitation',
  'system_notification',
  'subscription_started',
  'payment_failed',
] as const;
export type PlatformTemplateType = (typeof PLATFORM_TEMPLATE_TYPES)[number];

export const TENANT_TEMPLATE_TYPES = [
  'invoice',
  'appointment',
  'follow_up',
  'estimate',
  'customer_communication',
] as const;
export type TenantTemplateType = (typeof TENANT_TEMPLATE_TYPES)[number];

function smtpTransportOptions(cfg: SmtpConfig) {
  const port = Number(cfg.port) || 587;
  const implicitTls = port === 465;
  const wantTls = cfg.secure || implicitTls;
  return {
    host: cfg.host,
    port,
    secure: implicitTls,
    requireTLS: !implicitTls && wantTls,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password || undefined } : undefined,
    tls: { minVersion: 'TLSv1.2' as const },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 20_000,
    family: 4,
  };
}

function transporter(cfg: SmtpConfig) {
  return nodemailer.createTransport(smtpTransportOptions(cfg));
}

function smtpErrorMessage(err: unknown) {
  if (!err || typeof err !== 'object') return 'Send failed';
  const e = err as { message?: string; code?: string; response?: string };
  const detail = String(e.response || e.message || 'Send failed').slice(0, 280);
  if (e.code && !detail.includes(e.code)) return `${e.code}: ${detail}`;
  return detail;
}

function fromHeader(cfg: SmtpConfig) {
  return cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail;
}

function skipLog(channel: EmailChannel, to: string, subject: string, reason: string, text?: string) {
  if (process.env.NODE_ENV === 'production') return;
  console.log(`[email skipped channel=${channel} reason=${reason}] to=${to} subject=${subject}${text ? `\n${text}` : ''}`);
}

export type EmailReceipt = {
  at: string;
  channel: EmailChannel;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  from: string;
  replyTo: string | null;
  to: string;
  subject: string;
  messageId?: string;
  accepted?: string[];
  response?: string;
  ok: boolean;
  error?: string;
  preview?: string;
};

const receipts: EmailReceipt[] = [];
const RECEIPT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../email-delivery-receipts.jsonl');

function recordReceipt(row: EmailReceipt) {
  receipts.push(row);
  if (receipts.length > 500) receipts.shift();
  try {
    fs.appendFileSync(RECEIPT_FILE, `${JSON.stringify(row)}\n`);
  } catch { /* ignore */ }
}

export function recentEmailReceipts(limit = 80) {
  let fromFile: EmailReceipt[] = [];
  try {
    if (fs.existsSync(RECEIPT_FILE)) {
      fromFile = fs.readFileSync(RECEIPT_FILE, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as EmailReceipt);
    }
  } catch { /* ignore */ }
  const byKey = new Map<string, EmailReceipt>();
  for (const row of [...fromFile, ...receipts]) {
    const key = `${row.at}|${row.channel}|${row.to}|${row.subject}|${row.messageId || row.error || ''}`;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
}

async function deliver(channel: EmailChannel, cfg: SmtpConfig, to: string, subject: string, text: string, html?: string): Promise<{ ok: true; receipt: EmailReceipt } | { ok: false; error: string; receipt: EmailReceipt }> {
  const base: EmailReceipt = {
    at: new Date().toISOString(),
    channel,
    smtpHost: cfg.host,
    smtpPort: Number(cfg.port) || 587,
    smtpUser: cfg.user || null,
    from: fromHeader(cfg),
    replyTo: cfg.replyTo || null,
    to,
    subject,
    ok: false,
  };
  if (!cfg.password && cfg.user) {
    const error = 'SMTP password is missing. Save the password, then send the test again.';
    recordReceipt({ ...base, error });
    return { ok: false, error, receipt: { ...base, error } };
  }
  const t = transporter(cfg);
  try {
    const info = await t.sendMail({
      from: fromHeader(cfg),
      replyTo: cfg.replyTo || undefined,
      to,
      subject,
      text,
      html: html ?? `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    });
    const receipt: EmailReceipt = {
      ...base,
      ok: true,
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : undefined,
      response: typeof info.response === 'string' ? info.response.slice(0, 200) : undefined,
      preview: process.env.NODE_ENV === 'production' ? undefined : text.slice(0, 240),
    };
    recordReceipt(receipt);
    return { ok: true, receipt };
  } catch (err) {
    const message = smtpErrorMessage(err);
    console.error(`email send failed channel=${channel}`, message);
    const receipt = { ...base, error: message };
    recordReceipt(receipt);
    return { ok: false, error: message, receipt };
  }
}

/** Super Admin / FieldPro SMTP only. Never reads tenant settings. */
export async function loadPlatformSmtp(): Promise<SmtpConfig | null> {
  const { rows } = await pool.query(`SELECT * FROM platform_settings WHERE id = 1`);
  const s = rows[0];
  if (!s?.smtp_host || !s?.smtp_from_email) return null;
  return {
    host: s.smtp_host,
    port: s.smtp_port || 587,
    user: s.smtp_user,
    password: s.smtp_password_enc ? decryptSecret(s.smtp_password_enc) : null,
    secure: !!s.smtp_secure,
    fromName: s.smtp_from_name,
    fromEmail: s.smtp_from_email,
    replyTo: s.smtp_reply_to,
  };
}

/** Tenant CRM SMTP only. Never falls back to platform SMTP. */
export async function loadTenantSmtp(client: PoolClient, companyId: string): Promise<SmtpConfig | null> {
  const { rows } = await client.query(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_secure, smtp_from_name, smtp_from_email, smtp_reply_to
     FROM company_settings WHERE company_id = $1`,
    [companyId],
  );
  const s = rows[0];
  if (!s?.smtp_host || !s?.smtp_from_email) return null;
  return {
    host: s.smtp_host,
    port: s.smtp_port || 587,
    user: s.smtp_user,
    password: s.smtp_password_enc ? decryptSecret(s.smtp_password_enc) : null,
    secure: !!s.smtp_secure,
    fromName: s.smtp_from_name,
    fromEmail: s.smtp_from_email,
    replyTo: s.smtp_reply_to,
  };
}

export function renderEmailTemplate(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? ''),
    template,
  );
}

export async function loadPlatformTemplate(type: PlatformTemplateType) {
  const { rows } = await pool.query(
    `SELECT name, subject, body FROM platform_email_templates WHERE type = $1`,
    [type],
  );
  return rows[0] as { name: string; subject: string; body: string } | undefined;
}

export async function loadTenantTemplate(client: PoolClient, companyId: string, type: TenantTemplateType) {
  const { rows } = await client.query(
    `SELECT id, name, subject, body, type FROM email_templates
     WHERE company_id = $1 AND type = $2
     ORDER BY name ASC LIMIT 1`,
    [companyId, type],
  );
  return rows[0] as { id: string; name: string; subject: string; body: string; type: string } | undefined;
}

export type SendPlatformOpts = {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  templateType?: PlatformTemplateType;
  vars?: Record<string, string>;
};

/** FieldPro system mail. Always Super Admin SMTP. Sender cannot be overridden. */
export async function sendPlatformEmail(opts: SendPlatformOpts): Promise<boolean> {
  const cfg = await loadPlatformSmtp();
  let subject = opts.subject || '';
  let text = opts.text || '';
  if (opts.templateType) {
    const tpl = await loadPlatformTemplate(opts.templateType);
    const vars = opts.vars ?? {};
    if (tpl) {
      subject = renderEmailTemplate(tpl.subject, vars);
      text = renderEmailTemplate(tpl.body, vars);
    }
  }
  if (!cfg) {
    skipLog('platform', opts.to, subject || '(no subject)', 'not_configured', text);
    recordReceipt({
      at: new Date().toISOString(),
      channel: 'platform',
      smtpHost: '',
      smtpPort: 0,
      smtpUser: null,
      from: '',
      replyTo: null,
      to: opts.to,
      subject: subject || '(no subject)',
      ok: false,
      error: 'not_configured',
      preview: process.env.NODE_ENV === 'production' ? undefined : text.slice(0, 240),
    });
    return false;
  }
  return (await deliver('platform', cfg, opts.to, subject, text, opts.html)).ok;
}

export type SendTenantOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Tenant-to-customer CRM mail. Always that company's SMTP. Sender cannot be overridden. */
export async function sendTenantEmail(
  client: PoolClient,
  companyId: string,
  opts: SendTenantOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await loadTenantSmtp(client, companyId);
  if (!cfg) {
    skipLog('tenant', opts.to, opts.subject, 'not_configured', opts.text);
    recordReceipt({
      at: new Date().toISOString(),
      channel: 'tenant',
      smtpHost: '',
      smtpPort: 0,
      smtpUser: null,
      from: '',
      replyTo: null,
      to: opts.to,
      subject: opts.subject,
      ok: false,
      error: 'not_configured',
      preview: process.env.NODE_ENV === 'production' ? undefined : opts.text.slice(0, 240),
    });
    return { ok: false as const, error: 'not_configured' };
  }
  const result = await deliver('tenant', cfg, opts.to, opts.subject, opts.text, opts.html);
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}

/** @deprecated Use sendPlatformEmail or sendTenantEmail. No cross-channel fallback. */
export async function sendPlatformMail(to: string, subject: string, text: string) {
  return sendPlatformEmail({ to, subject, text });
}

export async function sendPlatformSmtpTest(to?: string) {
  const cfg = await loadPlatformSmtp();
  if (!cfg) return { ok: false as const, error: 'Platform SMTP is not configured' };
  const result = await deliver('platform', cfg, to || cfg.fromEmail, 'FieldPro platform SMTP test', 'Platform SMTP is working. This sender is FieldPro system email only.');
  if (result.ok) return { ok: true as const, evidence: result.receipt };
  return { ok: false as const, error: result.error, evidence: result.receipt };
}

export async function sendTenantSmtpTest(client: PoolClient, companyId: string, to?: string) {
  const cfg = await loadTenantSmtp(client, companyId);
  if (!cfg) return { ok: false as const, error: 'Tenant SMTP is not configured. Customer emails will not use FieldPro platform SMTP.' };
  const result = await deliver('tenant', cfg, to || cfg.fromEmail, 'FieldPro company email test', 'Your company SMTP is working. This sender is used only for customer/CRM email.');
  if (result.ok) return { ok: true as const, evidence: result.receipt };
  return { ok: false as const, error: result.error, evidence: result.receipt };
}
