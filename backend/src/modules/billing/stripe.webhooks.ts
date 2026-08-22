import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { env } from '../../config/env.js';
import { stripeClient } from '../../services/stripe.js';
import { pool, withTenant } from '../../db/pool.js';
import { notifyByPermission, notifyPlatformAdmins } from '../../utils/helpers.js';

async function upsertBillingInvoice(companyId: string, inv: Stripe.Invoice) {
  await withTenant(companyId, null, true, async (client) => {
    await client.query(
      `INSERT INTO billing_invoices (
         company_id, stripe_invoice_id, number, amount_cents, currency, status, hosted_url, pdf_url, period_start, period_end
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9), to_timestamp($10))
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         status = excluded.status, hosted_url = excluded.hosted_url, pdf_url = excluded.pdf_url,
         amount_cents = excluded.amount_cents, number = excluded.number`,
      [
        companyId,
        inv.id,
        inv.number,
        inv.amount_paid || inv.amount_due || 0,
        inv.currency || 'usd',
        inv.status || 'open',
        inv.hosted_invoice_url,
        inv.invoice_pdf,
        inv.period_start || null,
        inv.period_end || null,
      ],
    );
  });
}

async function companyByStripe(customerId?: string | null, subscriptionId?: string | null, metadataCompanyId?: string | null) {
  if (metadataCompanyId) {
    const { rows } = await pool.query(`SELECT * FROM companies WHERE id = $1`, [metadataCompanyId]);
    if (rows[0]) return rows[0];
  }
  if (subscriptionId) {
    const { rows } = await pool.query(`SELECT * FROM companies WHERE stripe_subscription_id = $1`, [subscriptionId]);
    if (rows[0]) return rows[0];
  }
  if (customerId) {
    const { rows } = await pool.query(`SELECT * FROM companies WHERE stripe_customer_id = $1`, [customerId]);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function applySubscription(sub: Stripe.Subscription) {
  const company = await companyByStripe(
    typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    sub.id,
    sub.metadata?.companyId,
  );
  if (!company) return;
  const planId = sub.metadata?.planId || company.plan_id;
  let status = company.status;
  if (sub.status === 'active' || sub.status === 'trialing') status = sub.status === 'trialing' ? 'trial' : 'active';
  else if (sub.status === 'past_due') status = 'past_due';
  else if (sub.status === 'canceled' || sub.status === 'unpaid') status = 'suspended';
  await pool.query(
    `UPDATE companies SET
       stripe_subscription_id = $2,
       stripe_customer_id = coalesce(stripe_customer_id, $3),
       plan_id = coalesce($4::uuid, plan_id),
       status = $5
     WHERE id = $1`,
    [company.id, sub.id, typeof sub.customer === 'string' ? sub.customer : null, planId, status],
  );
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const stripe = stripeClient();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: { message: 'Stripe webhooks not configured' } });
  }
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') return res.status(400).send('Missing signature');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Invalid signature');
  }

  const recorded = await pool.query(
    `INSERT INTO billing_events (stripe_event_id, type, payload) VALUES ($1,$2,$3)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`,
    [event.id, event.type, event as unknown as object],
  );
  if (!recorded.rowCount) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;
      if (companyId && session.subscription) {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        await pool.query(
          `UPDATE companies SET stripe_subscription_id = $2, stripe_customer_id = coalesce(stripe_customer_id, $3), status = 'active', plan_id = coalesce($4::uuid, plan_id)
           WHERE id = $1`,
          [companyId, subId, typeof session.customer === 'string' ? session.customer : null, session.metadata?.planId],
        );
        await withTenant(companyId, null, true, async (client) => {
          await notifyByPermission(client, companyId, 'billing.manage', {
            title: 'Subscription started',
            message: 'Your FieldPro subscription is active.',
            type: 'success',
            eventKey: 'billing.started',
            linkPath: '/admin/settings?tab=billing',
            emailPref: 'billing',
          });
        });
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await applySubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const inv = event.data.object as Stripe.Invoice;
      const subRef = (inv as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription
        ?? (inv as { parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } } }).parent?.subscription_details?.subscription;
      const subId = typeof subRef === 'string' ? subRef : subRef?.id;
      const company = await companyByStripe(
        typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
        subId,
        inv.metadata?.companyId,
      );
      if (company) {
        await upsertBillingInvoice(company.id, inv);
        await pool.query(`UPDATE billing_events SET company_id = $2 WHERE stripe_event_id = $1`, [event.id, company.id]);
        if (event.type === 'invoice.paid') {
          await pool.query(`UPDATE companies SET status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END WHERE id = $1`, [company.id]);
          await withTenant(company.id, null, true, async (client) => {
            await notifyByPermission(client, company.id, 'billing.manage', {
              title: 'Invoice paid',
              message: `Subscription invoice ${inv.number || ''} was paid.`,
              type: 'success',
              eventKey: 'billing.invoice_paid',
              linkPath: '/admin/settings?tab=billing',
              emailPref: 'billing',
            });
          });
        } else {
          await pool.query(`UPDATE companies SET status = 'past_due' WHERE id = $1 AND status <> 'suspended'`, [company.id]);
          await withTenant(company.id, null, true, async (client) => {
            await notifyByPermission(client, company.id, 'billing.manage', {
              title: 'Payment failed',
              message: 'A subscription payment failed. Update your card to avoid interruption.',
              type: 'error',
              eventKey: 'billing.payment_failed',
              linkPath: '/admin/settings?tab=billing',
              emailPref: 'billing',
            });
            await notifyPlatformAdmins(client, 'Tenant payment failed', `${company.name} has a failed subscription payment`, {
              eventKey: 'billing.payment_failed',
              linkPath: `/super-admin/companies/${company.id}`,
            });
          });
        }
      }
    }
  } catch (err) {
    console.error('stripe webhook handler', err);
    return res.status(500).send('Webhook handler failed');
  }
  res.json({ received: true });
}
