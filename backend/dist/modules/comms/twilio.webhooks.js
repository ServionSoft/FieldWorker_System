import { Router } from 'express';
import pg from 'pg';
import twilio from 'twilio';
import { pool, withTenant, pgPoolConfig } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { validateTwilioSignature } from '../../services/twilio.js';
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
    const { rows } = await pool.query(`SELECT id FROM companies
     WHERE deleted_at IS NULL
       AND (
         right(regexp_replace(coalesce(twilio_number, ''), '\\D', '', 'g'), 10) = $1
         OR right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
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
twilioWebhooks.use((req, res, next) => {
    if (!validateTwilioSignature(req)) {
        return res.status(403).type('text/xml').send('<Response></Response>');
    }
    next();
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