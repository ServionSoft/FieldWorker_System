import twilio from 'twilio';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';
import { toE164 } from '../utils/phone.js';
import { decryptSecret } from '../utils/crypto.js';
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
export function decryptTwilioAuthToken(enc) {
    if (!enc)
        return null;
    try {
        return decryptSecret(enc);
    }
    catch {
        return null;
    }
}
export async function loadTenantTwilio(client, companyId) {
    const { rows } = await client.query(`SELECT cs.twilio_account_sid, cs.twilio_auth_token_enc,
            coalesce(nullif(cs.twilio_from_number, ''), c.twilio_number) AS from_number
     FROM companies c
     LEFT JOIN company_settings cs ON cs.company_id = c.id
     WHERE c.id = $1`, [companyId]);
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
        if (!from)
            return null;
        return {
            accountSid: env.TWILIO_ACCOUNT_SID,
            authToken: env.TWILIO_AUTH_TOKEN,
            fromNumber: from,
            source: 'platform',
        };
    }
    return null;
}
export function requireTenantTwilio(creds) {
    if (!creds) {
        throw badRequest('Twilio is not configured. Add Account SID, Auth Token, and From number in Settings → Twilio.');
    }
    return creds;
}
export function twilioClientFor(creds) {
    return twilio(creds.accountSid, creds.authToken);
}
export async function verifyTwilioCredentials(accountSid, authToken) {
    try {
        const account = await twilio(accountSid, authToken).api.accounts(accountSid).fetch();
        return { ok: true, friendlyName: account.friendlyName || accountSid };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Twilio credentials were rejected';
        return { ok: false, error: message };
    }
}
export function twilioWebhookRequestUrl(req) {
    const host = req.get?.('host') ?? '';
    const proto = req.get?.('x-forwarded-proto') || req.protocol || 'https';
    return env.TWILIO_WEBHOOK_BASE
        ? `${webhookBase()}${req.originalUrl || req.url}`
        : `${proto}://${host}${req.originalUrl || req.url}`;
}
export function requestMatchesTwilioToken(req, authToken) {
    if (env.TWILIO_SKIP_SIGNATURE)
        return true;
    if (!authToken)
        return false;
    const signature = String(req.headers['x-twilio-signature'] ?? '');
    if (!signature)
        return false;
    const params = {};
    for (const [k, v] of Object.entries(req.body ?? {})) {
        if (v != null)
            params[k] = String(v);
    }
    return twilio.validateRequest(authToken, signature, twilioWebhookRequestUrl(req), params);
}
//# sourceMappingURL=twilio.js.map