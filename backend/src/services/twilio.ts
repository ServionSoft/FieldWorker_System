import twilio from 'twilio';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';
import { toE164 } from '../utils/phone.js';
import { decryptSecret } from '../utils/crypto.js';

export type TenantTwilio = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  source: 'tenant' | 'platform';
};

export function webhookBase() {
  return (env.TWILIO_WEBHOOK_BASE || `http://localhost:${env.PORT}`).replace(/\/$/, '');
}

export function twilioWebhookUrls() {
  const base = webhookBase();
  return {
    sms: `${base}/api/webhooks/twilio/sms`,
    voice: `${base}/api/webhooks/twilio/voice`,
    status: `${base}/api/webhooks/twilio/status`,
  };
}

export function decryptTwilioAuthToken(enc: string | null | undefined) {
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export async function loadTenantTwilio(client: PoolClient, companyId: string): Promise<TenantTwilio | null> {
  const { rows } = await client.query(
    `SELECT cs.twilio_account_sid, cs.twilio_auth_token_enc,
            coalesce(nullif(cs.twilio_from_number, ''), c.twilio_number) AS from_number
     FROM companies c
     LEFT JOIN company_settings cs ON cs.company_id = c.id
     WHERE c.id = $1`,
    [companyId],
  );
  const r = rows[0];
  if (r?.twilio_account_sid && r?.twilio_auth_token_enc) {
    const token = decryptTwilioAuthToken(r.twilio_auth_token_enc);
    const from = toE164(r.from_number || '');
    if (token && from) {
      return {
        accountSid: r.twilio_account_sid,
        authToken: token,
        fromNumber: from,
        source: 'tenant',
      };
    }
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    const from = toE164(r?.from_number || env.TWILIO_FROM_NUMBER || '');
    if (!from) return null;
    return {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      fromNumber: from,
      source: 'platform',
    };
  }
  return null;
}

export function requireTenantTwilio(creds: TenantTwilio | null): TenantTwilio {
  if (!creds) {
    throw badRequest('Twilio is not configured. Add Account SID, Auth Token, and From number in Settings → Twilio.');
  }
  return creds;
}

export function twilioClientFor(creds: TenantTwilio) {
  return twilio(creds.accountSid, creds.authToken);
}

export async function verifyTwilioCredentials(accountSid: string, authToken: string) {
  try {
    const account = await twilio(accountSid, authToken).api.accounts(accountSid).fetch();
    return { ok: true as const, friendlyName: account.friendlyName || accountSid };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Twilio credentials were rejected';
    return { ok: false as const, error: message };
  }
}

export function twilioWebhookRequestUrl(req: {
  originalUrl?: string;
  url: string;
  protocol?: string;
  get?: (h: string) => string | undefined;
}) {
  const host = req.get?.('host') ?? '';
  const proto = (req.get?.('x-forwarded-proto') as string) || req.protocol || 'https';
  return env.TWILIO_WEBHOOK_BASE
    ? `${webhookBase()}${req.originalUrl || req.url}`
    : `${proto}://${host}${req.originalUrl || req.url}`;
}

export function requestMatchesTwilioToken(
  req: {
    headers: Record<string, unknown>;
    originalUrl?: string;
    url: string;
    body: Record<string, unknown>;
    protocol?: string;
    get?: (h: string) => string | undefined;
  },
  authToken: string,
) {
  if (env.TWILIO_SKIP_SIGNATURE) return true;
  if (!authToken) return false;
  const signature = String(req.headers['x-twilio-signature'] ?? '');
  if (!signature) return false;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (v != null) params[k] = String(v);
  }
  return twilio.validateRequest(authToken, signature, twilioWebhookRequestUrl(req), params);
}
