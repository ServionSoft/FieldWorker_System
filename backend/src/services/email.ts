import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptSecret } from '../utils/crypto.js';
import { pool, withTenant } from '../db/pool.js';

function tryDecryptSecret(value: string | null | undefined): { ok: true; password: string | null } | { ok: false; error: string } {
  if (!value) return { ok: true, password: null };
  try {
    return { ok: true, password: decryptSecret(value) };
  } catch {
    return { ok: false, error: 'SMTP password could not be decrypted. Re-save the SMTP password, then try again.' };
  }
}

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
  'email_verification',
  'welcome',
  'tenant_invitation',
  'system_notification',
  'subscription_started',
  'payment_failed',
  'contact_confirmation',
] as const;
export type PlatformTemplateType = (typeof PLATFORM_TEMPLATE_TYPES)[number];

const PLATFORM_TEMPLATE_FALLBACKS: Record<PlatformTemplateType, { subject: string; body: string }> = {
  password_reset: {
    subject: 'Reset your FieldPro password',
    body: 'Hi {name},\n\nWe received a request to reset the password for your FieldPro account.\n\nThis link expires in 1 hour:\n{resetUrl}\n\nIf you did not request this, you can ignore this email. Your password will stay the same.',
  },
  email_verification: {
    subject: 'Verify your FieldPro email',
    body: 'Hi {name},\n\nVerify your email to activate your FieldPro trial for {companyName}.\n\n{verifyLink}\n\nThis link expires in 24 hours.\n\nIf you did not create this account, you can ignore this email.',
  },
  welcome: {
    subject: 'Welcome to FieldPro',
    body: 'Welcome {name}. Your company {companyName} is ready.',
  },
  tenant_invitation: {
    subject: 'You are invited to FieldPro',
    body: 'Join {companyName}: {inviteLink}',
  },
  system_notification: {
    subject: 'FieldPro notification',
    body: '{message}',
  },
  subscription_started: {
    subject: 'Your FieldPro subscription',
    body: 'Your subscription for {companyName} is active.',
  },
  payment_failed: {
    subject: 'Payment failed for FieldPro',
    body: 'Payment failed for {companyName}. Please update billing.',
  },
  contact_confirmation: {
    subject: 'We received your message — FieldPro',
    body: 'Hi {name},\n\nThanks for contacting FieldPro. We received your message and will get back to you within 24 hours.\n\nYour message:\n{message}\n\n— FieldPro',
  },
};

export const TENANT_TEMPLATE_TYPES = [
  'invoice',
  'appointment',
  'follow_up',
  'estimate',
  'customer_communication',
] as const;
export type TenantTemplateType = (typeof TENANT_TEMPLATE_TYPES)[number];

/**
 * Render and many cloud hosts have no IPv6 egress. Nodemailer 9 may pick an AAAA
 * record and fail with ENETUNREACH. Resolve A records only and keep the hostname
 * as TLS servername.
 */
async function resolveSmtpIpv4(host: string): Promise<{ host: string; servername?: string }> {
  const trimmed = String(host || '').trim();
  if (!trimmed) return { host: trimmed };
  if (net.isIPv4(trimmed)) return { host: trimmed };
  if (net.isIPv6(trimmed)) {
    throw new Error('SMTP host is an IPv6 address; this environment only supports IPv4. Use a hostname or IPv4 address.');
  }
  try {
    const addresses = await dns.resolve4(trimmed);
    if (addresses[0]) return { host: addresses[0], servername: trimmed };
  } catch {
    /* try lookup next */
  }
  const lookedUp = await dns.lookup(trimmed, { family: 4 });
  return { host: lookedUp.address, servername: trimmed };
}

async function smtpTransportOptions(cfg: SmtpConfig) {
  const port = Number(cfg.port) || 587;
  const implicitTls = port === 465;
  const wantTls = cfg.secure || implicitTls;
  const resolved = await resolveSmtpIpv4(cfg.host);
  return {
    host: resolved.host,
    servername: resolved.servername,
    port,
    secure: implicitTls,
    requireTLS: !implicitTls && wantTls,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password || undefined } : undefined,
    tls: {
      minVersion: 'TLSv1.2' as const,
      servername: resolved.servername || undefined,
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 20_000,
    family: 4 as const,
  };
}

async function transporter(cfg: SmtpConfig) {
  return nodemailer.createTransport(await smtpTransportOptions(cfg));
}

function smtpErrorMessage(err: unknown) {
  if (!err || typeof err !== 'object') return 'Send failed';
  const e = err as { message?: string; code?: string; response?: string; syscall?: string };
  const raw = String(e.response || e.message || 'Send failed');
  if (e.code === 'ENETUNREACH' || /ENETUNREACH/i.test(raw)) {
    return 'SMTP server is unreachable over IPv6 from this host. The app forces IPv4; redeploy if this persists.';
  }
  if (e.code === 'ETIMEDOUT' || /ETIMEDOUT|Connection timeout/i.test(raw)) {
    return 'SMTP connection timed out. Render free web services block outbound ports 25/465/587. Upgrade the backend to a paid instance, or use an HTTPS email API. Local SMTP still works.';
  }
  const detail = raw.slice(0, 280);
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
  try {
    const t = await transporter(cfg);
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
  const decrypted = tryDecryptSecret(s.smtp_password_enc);
  if (!decrypted.ok) throw new Error(decrypted.error);
  return {
    host: s.smtp_host,
    port: s.smtp_port || 587,
    user: s.smtp_user,
    password: decrypted.password,
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
  const decrypted = tryDecryptSecret(s.smtp_password_enc);
  if (!decrypted.ok) throw new Error(decrypted.error);
  return {
    host: s.smtp_host,
    port: s.smtp_port || 587,
    user: s.smtp_user,
    password: decrypted.password,
    secure: !!s.smtp_secure,
    fromName: s.smtp_from_name,
    fromEmail: s.smtp_from_email,
    replyTo: s.smtp_reply_to,
  };
}

function expandLinkAliases(vars: Record<string, string>) {
  const reset = vars.resetLink || vars.resetUrl || '';
  const verify = vars.verifyLink || vars.verifyUrl || '';
  const invite = vars.inviteLink || vars.inviteUrl || '';
  return {
    ...vars,
    ...(reset ? { resetLink: reset, resetUrl: reset } : {}),
    ...(verify ? { verifyLink: verify, verifyUrl: verify } : {}),
    ...(invite ? { inviteLink: invite, inviteUrl: invite } : {}),
  };
}

function actionFromVars(vars: Record<string, string>, templateType?: PlatformTemplateType) {
  const url = vars.resetUrl || vars.resetLink || vars.verifyUrl || vars.verifyLink || vars.inviteUrl || vars.inviteLink || '';
  if (!url) return undefined;
  const label = templateType === 'email_verification'
    ? 'Verify email'
    : templateType === 'tenant_invitation'
      ? 'Accept invitation'
      : templateType === 'password_reset'
        ? 'Reset password'
        : 'Open link';
  return { url, label };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function platformEmailHtml(text: string, action?: { url: string; label: string }) {
  const linked = escapeHtml(text)
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563EB;word-break:break-all">$1</a>');
  const button = action?.url
    ? `<p style="margin:28px 0 20px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0F172A;max-width:560px">${button}<p style="margin:0">${linked}</p></div>`;
}

export function renderEmailTemplate(template: string, vars: Record<string, string>) {
  if (!template) return '';
  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(expandLinkAliases(vars))) {
    const text = value ?? '';
    lookup.set(key, text);
    lookup.set(key.toLowerCase(), text);
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key: string) => {
    if (lookup.has(key)) return lookup.get(key) as string;
    const lower = key.toLowerCase();
    if (lookup.has(lower)) return lookup.get(lower) as string;
    return full;
  });
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

export type PlatformSendResult = { ok: true } | { ok: false; error: string };

/** FieldPro system mail. Always Super Admin SMTP. Sender cannot be overridden. */
export async function sendPlatformEmailResult(opts: SendPlatformOpts): Promise<PlatformSendResult> {
  const cfg = await loadPlatformSmtp();
  const vars = expandLinkAliases(opts.vars ?? {});
  let subject = opts.subject || '';
  let text = opts.text || '';
  if (opts.templateType) {
    const tpl = await loadPlatformTemplate(opts.templateType);
    if (tpl) {
      subject = renderEmailTemplate(tpl.subject, vars);
      text = renderEmailTemplate(tpl.body, vars);
    } else if (!subject && !text) {
      const fallback = PLATFORM_TEMPLATE_FALLBACKS[opts.templateType];
      if (fallback) {
        subject = renderEmailTemplate(fallback.subject, vars);
        text = renderEmailTemplate(fallback.body, vars);
      }
    }
  }
  const action = actionFromVars(vars, opts.templateType);
  if (action?.url && text && !text.includes(action.url)) {
    text = `${text.trim()}\n\n${action.url}`;
  }
  const html = opts.html || (text ? platformEmailHtml(text, action) : undefined);
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
    return { ok: false, error: 'Platform SMTP is not configured. Set it in Super Admin → Settings, then resend.' };
  }
  const result = await deliver('platform', cfg, opts.to, subject, text, html);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function sendPlatformEmail(opts: SendPlatformOpts): Promise<boolean> {
  return (await sendPlatformEmailResult(opts)).ok;
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
  try {
    const cfg = await loadPlatformSmtp();
    if (!cfg) return { ok: false as const, error: 'Platform SMTP is not configured' };
    const result = await deliver('platform', cfg, to || cfg.fromEmail, 'FieldPro platform SMTP test', 'Platform SMTP is working. This sender is FieldPro system email only.');
    if (result.ok) return { ok: true as const, evidence: result.receipt };
    return { ok: false as const, error: result.error, evidence: result.receipt };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Platform SMTP test failed' };
  }
}

/** Loads tenant SMTP in a short DB transaction, then sends outside the transaction. */
export async function sendTenantSmtpTest(companyId: string, to?: string) {
  try {
    const cfg = await withTenant(companyId, null, true, (client) => loadTenantSmtp(client, companyId));
    if (!cfg) {
      return {
        ok: false as const,
        error: 'Tenant SMTP is not configured. Save host, from email, and password first. Customer emails will not use FieldPro platform SMTP.',
      };
    }
    const result = await deliver(
      'tenant',
      cfg,
      to || cfg.fromEmail,
      'FieldPro company email test',
      'Your company SMTP is working. This sender is used only for customer/CRM email.',
    );
    if (result.ok) return { ok: true as const, evidence: result.receipt };
    return { ok: false as const, error: result.error, evidence: result.receipt };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Company SMTP test failed' };
  }
}
