import twilio from 'twilio';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';
import { toE164 } from '../utils/phone.js';
export function twilioConfigured() {
    return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}
export function requireTwilio() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw badRequest('Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }
    return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}
export function fromNumber(companyTwilio) {
    const n = toE164(companyTwilio || env.TWILIO_FROM_NUMBER || '');
    if (!n)
        throw badRequest('No Twilio From number. Set company Twilio number in Settings or TWILIO_FROM_NUMBER.');
    return n;
}
export function webhookBase() {
    return (env.TWILIO_WEBHOOK_BASE || `http://localhost:${env.PORT}`).replace(/\/$/, '');
}
export function validateTwilioSignature(req) {
    if (env.TWILIO_SKIP_SIGNATURE)
        return true;
    if (!env.TWILIO_AUTH_TOKEN)
        return false;
    const signature = String(req.headers['x-twilio-signature'] ?? '');
    if (!signature)
        return false;
    const host = req.get?.('host') ?? '';
    const proto = req.get?.('x-forwarded-proto') || req.protocol || 'https';
    const url = env.TWILIO_WEBHOOK_BASE
        ? `${webhookBase()}${req.originalUrl || req.url}`
        : `${proto}://${host}${req.originalUrl || req.url}`;
    const params = {};
    for (const [k, v] of Object.entries(req.body ?? {})) {
        if (v != null)
            params[k] = String(v);
    }
    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
}
//# sourceMappingURL=twilio.js.map