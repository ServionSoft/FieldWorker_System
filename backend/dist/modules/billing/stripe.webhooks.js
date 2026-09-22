import { env } from '../../config/env.js';
import { stripeClient } from '../../services/stripe.js';
import { pool, withTenant } from '../../db/pool.js';
import { notifyByPermission } from '../../utils/helpers.js';
import { applyPaymentFailed, applyPaymentPaid, upsertBillingInvoice } from './billing-effects.js';
import { persistStripeSubscription, stripeInvoiceToInput, syncCompanyBillingFromStripe, uuidOrNull, } from './stripe-sync.js';
async function companyByStripe(customerId, subscriptionId, metadataCompanyId) {
    if (metadataCompanyId) {
        const { rows } = await pool.query(`SELECT * FROM companies WHERE id = $1`, [metadataCompanyId]);
        if (rows[0])
            return rows[0];
    }
    if (subscriptionId) {
        const { rows } = await pool.query(`SELECT * FROM companies WHERE stripe_subscription_id = $1`, [subscriptionId]);
        if (rows[0])
            return rows[0];
    }
    if (customerId) {
        const { rows } = await pool.query(`SELECT * FROM companies WHERE stripe_customer_id = $1`, [customerId]);
        if (rows[0])
            return rows[0];
    }
    return null;
}
async function companyByInvoiceId(invoiceId) {
    const { rows } = await pool.query(`SELECT c.*
     FROM billing_invoices b
     JOIN companies c ON c.id = b.company_id
     WHERE b.stripe_invoice_id = $1
     LIMIT 1`, [invoiceId]);
    return rows[0] || null;
}
function invoiceSubscriptionId(inv) {
    const subRef = inv.subscription
        ?? inv.parent?.subscription_details?.subscription;
    return typeof subRef === 'string' ? subRef : subRef?.id || null;
}
async function applySubscription(sub) {
    const company = await companyByStripe(typeof sub.customer === 'string' ? sub.customer : sub.customer?.id, sub.id, sub.metadata?.companyId);
    if (!company)
        return;
    await persistStripeSubscription(company.id, sub, company.status);
}
export async function stripeWebhookHandler(req, res) {
    const stripe = stripeClient();
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
        return res.status(503).json({ error: { message: 'Stripe webhooks not configured' } });
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string')
        return res.status(400).send('Missing signature');
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    }
    catch {
        return res.status(400).send('Invalid signature');
    }
    const recorded = await pool.query(`INSERT INTO billing_events (stripe_event_id, type, payload) VALUES ($1,$2,$3)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`, [event.id, event.type, event]);
    if (!recorded.rowCount) {
        return res.json({ received: true, duplicate: true });
    }
    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const companyId = session.metadata?.companyId;
            if (companyId) {
                if (session.subscription) {
                    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                    await pool.query(`UPDATE companies SET
               stripe_subscription_id = $2,
               stripe_customer_id = coalesce(stripe_customer_id, $3),
               plan_id = coalesce($4::uuid, plan_id),
               status = 'active',
               trial_ends_at = NULL
             WHERE id = $1`, [companyId, subId, typeof session.customer === 'string' ? session.customer : null, uuidOrNull(session.metadata?.planId)]);
                    try {
                        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price.product'] });
                        await persistStripeSubscription(companyId, sub, 'active', undefined, session.metadata?.planId);
                    }
                    catch {
                        /* sync below still applies plan from Stripe */
                    }
                }
                else if (session.customer) {
                    await pool.query(`UPDATE companies SET stripe_customer_id = coalesce(stripe_customer_id, $2) WHERE id = $1`, [companyId, typeof session.customer === 'string' ? session.customer : session.customer.id]);
                }
                await syncCompanyBillingFromStripe(companyId);
                await withTenant(companyId, null, true, async (tenantClient) => {
                    await notifyByPermission(tenantClient, companyId, 'billing.manage', {
                        title: 'Subscription started',
                        message: 'Your FieldPro subscription is active.',
                        type: 'success',
                        eventKey: 'billing.started',
                        linkPath: '/admin/settings?tab=billing',
                        emailPref: 'billing',
                    });
                });
            }
        }
        else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
            await applySubscription(event.data.object);
        }
        else if (event.type === 'invoice.finalized') {
            const inv = event.data.object;
            const company = await companyByStripe(typeof inv.customer === 'string' ? inv.customer : inv.customer?.id, invoiceSubscriptionId(inv), inv.metadata?.companyId) || await companyByInvoiceId(inv.id);
            if (company) {
                await pool.query(`UPDATE billing_events SET company_id = $2 WHERE stripe_event_id = $1`, [event.id, company.id]);
                await upsertBillingInvoice(company.id, stripeInvoiceToInput(inv));
            }
        }
        else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            const inv = event.data.object;
            const company = await companyByStripe(typeof inv.customer === 'string' ? inv.customer : inv.customer?.id, invoiceSubscriptionId(inv), inv.metadata?.companyId) || await companyByInvoiceId(inv.id);
            if (company) {
                await pool.query(`UPDATE billing_events SET company_id = $2 WHERE stripe_event_id = $1`, [event.id, company.id]);
                if (event.type === 'invoice.paid') {
                    await applyPaymentPaid(company.id, inv);
                    await syncCompanyBillingFromStripe(company.id);
                }
                else {
                    await applyPaymentFailed(company, inv);
                }
            }
        }
    }
    catch (err) {
        console.error('stripe webhook handler', err);
        return res.status(500).send('Webhook handler failed');
    }
    res.json({ received: true });
}
//# sourceMappingURL=stripe.webhooks.js.map