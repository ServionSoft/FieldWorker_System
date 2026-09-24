import { Router } from 'express';
import pg from 'pg';
import twilio from 'twilio';
import { withTenant, pgPoolConfig } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { decryptTwilioAuthToken, requestMatchesTwilioToken } from '../../services/twilio.js';
import { last10, toE164 } from '../../utils/phone.js';
const { twiml } = twilio;
const adminPool = new pg.Pool(pgPoolConfig(env.DATABASE_URL, { max: 4 }));
export const twilioWebhooks = Router();
function okTwiml(res, xml = '<Response></Response>') {
    res.type('text/xml').send(xml);
}
async function findCompanyByNumber(phone) {
    const key = last10(phone);
    if (!key)
        return null;
    const { rows } = await adminPool.query(`SELECT c.id FROM companies c
     LEFT JOIN company_settings cs ON cs.company_id = c.id
     WHERE c.deleted_at IS NULL
       AND (
         right(regexp_replace(coalesce(cs.twilio_from_number, c.twilio_number, ''), '\\D', '', 'g'), 10) = $1
         OR right(regexp_replace(coalesce(c.twilio_number, ''), '\\D', '', 'g'), 10) = $1
         OR right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10) = $1
       )
     LIMIT 1`, [key]);
    return rows[0]?.id ?? null;
}
async function findCustomerByPhone(companyId, phone) {
    const key = last10(phone);
    if (!key)
        return null;
    return withTenant(companyId, null, false, async (client) => {
        const { rows } = await client.query(`SELECT customer_id FROM customer_contacts
       WHERE company_id = $1 AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2
       LIMIT 1`, [companyId, key]);
        return rows[0]?.customer_id ?? null;
    });
}
async function authTokensForRequest(req) {
    const tokens = new Set();
    const companyIds = new Set();
    const to = String(req.body?.To ?? '');
    const companyFromTo = await findCompanyByNumber(to);
    if (companyFromTo)
        companyIds.add(companyFromTo);
    const sid = String(req.body?.CallSid || req.body?.MessageSid || '');
    if (sid) {
        const { rows } = await adminPool.query(`SELECT company_id FROM communications WHERE twilio_sid = $1 LIMIT 1`, [sid]);
        if (rows[0]?.company_id)
            companyIds.add(rows[0].company_id);
    }
    const connectMatch = String(req.originalUrl || req.url).match(/voice\/connect\/([0-9a-f-]{36})/i);
    if (connectMatch) {
        const { rows } = await adminPool.query(`SELECT company_id FROM communications WHERE id = $1`, [connectMatch[1]]);
        if (rows[0]?.company_id)
            companyIds.add(rows[0].company_id);
    }
    for (const companyId of companyIds) {
        const { rows } = await adminPool.query(`SELECT twilio_auth_token_enc FROM company_settings WHERE company_id = $1`, [companyId]);
        const token = decryptTwilioAuthToken(rows[0]?.twilio_auth_token_enc);
        if (token)
            tokens.add(token);
    }
    if (env.TWILIO_AUTH_TOKEN)
        tokens.add(env.TWILIO_AUTH_TOKEN);
    return [...tokens];
}
twilioWebhooks.use(async (req, res, next) => {
    if (env.TWILIO_SKIP_SIGNATURE)
        return next();
    try {
        const tokens = await authTokensForRequest(req);
        if (tokens.some((token) => requestMatchesTwilioToken(req, token)))
            return next();
    }
    catch {
        /* reject below */
    }
    return res.status(403).type('text/xml').send('<Response></Response>');
});
twilioWebhooks.post('/sms', async (req, res) => {
    const from = String(req.body.From ?? '');
    const to = String(req.body.To ?? '');
    const body = String(req.body.Body ?? '');
    const sid = String(req.body.MessageSid ?? '');
    const companyId = await findCompanyByNumber(to);
    if (companyId) {
        const customerId = await findCustomerByPhone(companyId, from);
        await withTenant(companyId, null, false, async (client) => {
            const existing = sid
                ? await client.query(`SELECT id FROM communications WHERE twilio_sid = $1`, [sid])
                : { rowCount: 0 };
            if (!existing.rowCount) {
                await client.query(`INSERT INTO communications (
             company_id, type, direction, status, from_number, to_number,
             customer_id, body, twilio_sid, read
           ) VALUES ($1,'sms','inbound','received',$2,$3,$4,$5,$6,false)`, [companyId, from, to, customerId, body || null, sid || null]);
            }
        });
    }
    okTwiml(res);
});
twilioWebhooks.post('/voice', async (req, res) => {
    const from = String(req.body.From ?? '');
    const to = String(req.body.To ?? '');
    const sid = String(req.body.CallSid ?? '');
    const companyId = await findCompanyByNumber(to);
    if (companyId) {
        const customerId = await findCustomerByPhone(companyId, from);
        await withTenant(companyId, null, false, async (client) => {
            const existing = sid
                ? await client.query(`SELECT id FROM communications WHERE twilio_sid = $1`, [sid])
                : { rowCount: 0 };
            if (!existing.rowCount) {
                await client.query(`INSERT INTO communications (
             company_id, type, direction, status, from_number, to_number,
             customer_id, body, twilio_sid, read
           ) VALUES ($1,'call','inbound','queued',$2,$3,$4,$5,$6,false)`, [companyId, from, to, customerId, 'Inbound call', sid || null]);
            }
        });
    }
    const vr = new twiml.VoiceResponse();
    vr.say({ voice: 'alice' }, 'Please hold while we connect you.');
    okTwiml(res, vr.toString());
});
twilioWebhooks.post('/voice/connect/:id', async (req, res) => {
    const { rows } = await adminPool.query(`SELECT to_number, from_number FROM communications WHERE id = $1`, [req.params.id]);
    const vr = new twiml.VoiceResponse();
    if (!rows[0]) {
        vr.say('Call could not be connected.');
        return okTwiml(res, vr.toString());
    }
    const dial = vr.dial({ callerId: toE164(rows[0].from_number) || undefined });
    dial.number(toE164(rows[0].to_number));
    okTwiml(res, vr.toString());
});
twilioWebhooks.post('/status', async (req, res) => {
    const sid = String(req.body.CallSid || req.body.MessageSid || '');
    const status = String(req.body.CallStatus || req.body.MessageStatus || '');
    const duration = req.body.CallDuration != null ? Number(req.body.CallDuration) : null;
    if (sid) {
        const mapped = status === 'completed' || status === 'delivered' ? (req.body.CallSid ? 'completed' : 'delivered')
            : status === 'busy' ? 'busy'
                : status === 'no-answer' || status === 'no_answer' ? 'no_answer'
                    : status === 'failed' || status === 'undelivered' ? 'failed'
                        : status === 'ringing' || status === 'queued' || status === 'initiated' ? 'queued'
                            : status || 'sent';
        await adminPool.query(`UPDATE communications SET
         status = $2,
         duration_sec = coalesce($3, duration_sec)
       WHERE twilio_sid = $1`, [sid, mapped, Number.isFinite(duration) ? duration : null]);
    }
    res.status(204).end();
});
//# sourceMappingURL=twilio.webhooks.js.map