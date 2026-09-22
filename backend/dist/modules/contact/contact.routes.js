import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { wrap } from '../../utils/async.js';
import { AppError } from '../../utils/errors.js';
import { sendPlatformEmail, loadPlatformSmtp } from '../../services/email.js';
import { notifyPlatformAdmins } from '../../utils/helpers.js';
export const contactRouter = Router();
contactRouter.post('/', wrap(async (req, res) => {
    const body = z.object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        email: z.string().trim().email().max(160),
        company: z.string().trim().max(160).optional().default(''),
        message: z.string().trim().min(10).max(4000),
    }).parse(req.body);
    const smtp = await loadPlatformSmtp();
    if (!smtp) {
        throw new AppError(503, 'SMTP_NOT_CONFIGURED', 'Contact email is not configured. Try again later.');
    }
    const name = `${body.firstName} ${body.lastName}`.trim();
    const sent = await sendPlatformEmail({
        to: body.email,
        templateType: 'contact_confirmation',
        vars: {
            name,
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            company: body.company || '—',
            message: body.message,
        },
    });
    if (!sent) {
        throw new AppError(503, 'EMAIL_FAILED', 'Could not send your message. Try again later.');
    }
    try {
        await pool.query(`INSERT INTO contact_inquiries (first_name, last_name, email, company, message)
       VALUES ($1,$2,$3,$4,$5)`, [body.firstName, body.lastName, body.email, body.company || null, body.message]);
    }
    catch (err) {
        console.error('contact inquiry persist failed', err);
    }
    const summary = `${name} (${body.email})${body.company ? ` at ${body.company}` : ''} wrote: ${body.message}`;
    try {
        await withTransaction(async (client) => {
            await notifyPlatformAdmins(client, 'New homepage contact', summary.slice(0, 400), {
                eventKey: 'contact.inquiry',
            });
        });
    }
    catch (err) {
        console.error('contact admin notify failed', err);
    }
    res.status(201).json({ ok: true });
}));
//# sourceMappingURL=contact.routes.js.map