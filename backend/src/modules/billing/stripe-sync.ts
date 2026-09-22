import type { PoolClient } from 'pg';
import type Stripe from 'stripe';
import { pool, withTenant } from '../../db/pool.js';
import { stripeClient } from '../../services/stripe.js';
import { upsertBillingInvoice, type BillingInvoiceInput } from './billing-effects.js';

const LIVE_SUB_STATUSES: Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
];

export function uuidOrNull(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

async function runCompanyQuery(client: PoolClient | undefined, sql: string, params: unknown[]) {
  if (client) return client.query(sql, params);
  return pool.query(sql, params);
}

export function stripeInvoiceToInput(inv: Stripe.Invoice): BillingInvoiceInput {
  const line = inv.lines?.data?.[0];
  const period = line?.period;
  const legacy = inv as Stripe.Invoice & { period_start?: number | null; period_end?: number | null };
  return {
    id: inv.id,
    number: inv.number,
    amount_paid: inv.amount_paid,
    amount_due: inv.amount_due,
    currency: inv.currency || 'usd',
    status: inv.status || 'open',
    hosted_invoice_url: inv.hosted_invoice_url,
    invoice_pdf: inv.invoice_pdf,
    period_start: legacy.period_start || period?.start || null,
    period_end: legacy.period_end || period?.end || null,
  };
}

export function companyStatusFromStripe(
  subStatus: Stripe.Subscription.Status,
  currentStatus: string,
): string | null {
  if (subStatus === 'active') return 'active';
  if (subStatus === 'trialing') return 'trial';
  if (subStatus === 'past_due') return 'past_due';
  if (subStatus === 'canceled' || subStatus === 'unpaid' || subStatus === 'incomplete_expired') {
    return 'suspended';
  }
  return currentStatus;
}

export async function persistStripeSubscription(
  companyId: string,
  sub: Stripe.Subscription,
  currentStatus = 'trial',
  client?: PoolClient,
) {
  const planId = uuidOrNull(sub.metadata?.planId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;
  const status = companyStatusFromStripe(sub.status, currentStatus);
  await runCompanyQuery(
    client,
    `UPDATE companies SET
       stripe_subscription_id = $2,
       stripe_customer_id = coalesce(stripe_customer_id, $3),
       plan_id = coalesce($4::uuid, plan_id),
       status = coalesce($5, status),
       trial_ends_at = CASE WHEN $5 = 'active' THEN NULL ELSE trial_ends_at END
     WHERE id = $1`,
    [companyId, sub.id, customerId, planId, status],
  );
}

async function closeLocalInvoicesPaidOnStripe(
  companyId: string,
  stillOpenStripeIds: string[],
  client?: PoolClient,
) {
  const fn = async (c: PoolClient) => {
    if (stillOpenStripeIds.length === 0) {
      await c.query(
        `UPDATE billing_invoices
         SET status = 'paid'
         WHERE company_id = $1 AND status IN ('open', 'draft', 'uncollectible')`,
        [companyId],
      );
      return;
    }
    await c.query(
      `UPDATE billing_invoices
       SET status = 'paid'
       WHERE company_id = $1
         AND status IN ('open', 'draft', 'uncollectible')
         AND (stripe_invoice_id IS NULL OR stripe_invoice_id LIKE 'sim_%' OR NOT (stripe_invoice_id = ANY($2)))`,
      [companyId, stillOpenStripeIds],
    );
  };
  if (client) return fn(client);
  return withTenant(companyId, null, true, fn);
}

export async function syncCompanyBillingFromStripe(companyId: string, client?: PoolClient) {
  const stripe = stripeClient();
  if (!stripe) return;

  const { rows } = await runCompanyQuery(
    client,
    `SELECT id, status, stripe_customer_id, stripe_subscription_id FROM companies WHERE id = $1`,
    [companyId],
  );
  const company = rows[0] as
    | { id: string; status: string; stripe_customer_id: string | null; stripe_subscription_id: string | null }
    | undefined;
  if (!company?.stripe_customer_id) return;

  try {
    let sub: Stripe.Subscription | null = null;
    if (company.stripe_subscription_id) {
      try {
        sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
      } catch {
        sub = null;
      }
    }
    if (!sub || sub.status === 'canceled' || sub.status === 'incomplete_expired') {
      const list = await stripe.subscriptions.list({
        customer: company.stripe_customer_id,
        status: 'all',
        limit: 10,
      });
      sub =
        list.data.find((s) => LIVE_SUB_STATUSES.includes(s.status))
        || list.data[0]
        || sub;
    }

    if (sub) {
      await persistStripeSubscription(companyId, sub, company.status, client);
    }

    const invoices = await stripe.invoices.list({
      customer: company.stripe_customer_id,
      limit: 20,
    });
    for (const inv of invoices.data) {
      await upsertBillingInvoice(companyId, stripeInvoiceToInput(inv), client);
    }

    const subIsCurrent = sub && (sub.status === 'active' || sub.status === 'trialing');
    if (subIsCurrent) {
      const stillOpen = invoices.data
        .filter((inv) => inv.status === 'open' || inv.status === 'draft' || inv.status === 'uncollectible')
        .map((inv) => inv.id);
      await closeLocalInvoicesPaidOnStripe(companyId, stillOpen, client);
    }
  } catch (err) {
    console.error('stripe billing sync', err);
  }
}
