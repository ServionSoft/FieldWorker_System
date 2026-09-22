import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { badRequest, notFound } from '../../utils/errors.js';
import type Stripe from 'stripe';
import { stripeClient, stripeConfigured, publicAppUrl } from '../../services/stripe.js';
import { wrap } from '../../utils/async.js';
import { pool } from '../../db/pool.js';
import { persistStripeSubscription, syncCompanyBillingFromStripe } from './stripe-sync.js';

const LIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

function mapPlan(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price_cents) / 100,
    priceYearly: p.price_cents_yearly != null ? Number(p.price_cents_yearly) / 100 : Number(p.price_cents) * 12 / 100,
    billing: p.billing_interval,
    features: p.features,
    featureKeys: p.feature_keys ?? [],
    maxWorkers: p.max_workers,
    maxJobs: p.max_jobs,
    stripePriceIdMonthly: p.stripe_price_id_monthly,
    stripePriceIdYearly: p.stripe_price_id_yearly,
  };
}

function planAmountCents(p: { price_cents: unknown; price_cents_yearly?: unknown }, interval: 'monthly' | 'yearly') {
  const amountCents = interval === 'yearly'
    ? Number(p.price_cents_yearly ?? Number(p.price_cents) * 12)
    : Number(p.price_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw badRequest('Plan price is not configured');
  return Math.round(amountCents);
}

function priceDataForPlan(
  p: { name: string; price_cents: unknown; price_cents_yearly?: unknown },
  planId: string,
  interval: 'monthly' | 'yearly',
) {
  return {
    currency: 'usd' as const,
    unit_amount: planAmountCents(p, interval),
    recurring: { interval: interval === 'yearly' ? 'year' as const : 'month' as const },
    product_data: {
      name: `FieldPro ${p.name}`,
      metadata: { planId },
    },
  };
}

async function stripePriceIdForPlan(
  stripe: Stripe,
  p: {
    name: string;
    price_cents: unknown;
    price_cents_yearly?: unknown;
    stripe_price_id_monthly?: string | null;
    stripe_price_id_yearly?: string | null;
  },
  planId: string,
  interval: 'monthly' | 'yearly',
) {
  const configured = interval === 'yearly' ? p.stripe_price_id_yearly : p.stripe_price_id_monthly;
  if (configured) return configured;
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: planAmountCents(p, interval),
    recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
    product_data: { name: `FieldPro ${p.name}` },
    metadata: { planId, interval },
  });
  return price.id;
}

async function billingPayload(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, companyId: string) {
  const company = await client.query(
    `SELECT c.*, p.name AS plan_name, p.price_cents, p.features, p.feature_keys, p.max_workers, p.max_jobs
     FROM companies c JOIN subscription_plans p ON p.id = c.plan_id WHERE c.id = $1`,
    [companyId],
  );
  const c = company.rows[0];
  if (!c) throw notFound('Company');
  const invoices = await client.query(
    `SELECT * FROM billing_invoices WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [companyId],
  );
  const plans = await client.query(`SELECT * FROM subscription_plans ORDER BY price_cents`);
  return {
    stripeConfigured: stripeConfigured(),
    subscription: {
      planId: c.plan_id,
      planName: c.plan_name,
      status: c.status,
      trialEndsAt: c.trial_ends_at ? (c.trial_ends_at as Date).toISOString() : null,
      stripeCustomerId: c.stripe_customer_id,
      stripeSubscriptionId: c.stripe_subscription_id,
      featureKeys: c.feature_keys ?? [],
    },
    invoices: invoices.rows.map((i) => ({
      id: i.id,
      number: i.number,
      amount: Number(i.amount_cents) / 100,
      currency: i.currency,
      status: i.status,
      hostedUrl: i.hosted_url,
      pdfUrl: i.pdf_url,
      periodStart: i.period_start ? (i.period_start as Date).toISOString() : null,
      periodEnd: i.period_end ? (i.period_end as Date).toISOString() : null,
      createdAt: (i.created_at as Date).toISOString(),
    })),
    plans: plans.rows.map(mapPlan),
  };
}

export const publicPlansRouter = Router();
publicPlansRouter.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM subscription_plans ORDER BY price_cents`);
  res.json({ items: rows.map(mapPlan), stripeConfigured: stripeConfigured() });
}));

export const billingRouter = Router();
billingRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('billing.manage'));

billingRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
  await syncCompanyBillingFromStripe(companyId, client);
  res.json(await billingPayload(client, companyId));
}));

billingRouter.post('/checkout', tenantRoute(async (req, res, client) => {
  const body = z.object({
    planId: z.string().uuid(),
    interval: z.enum(['monthly', 'yearly']).default('monthly'),
  }).parse(req.body);
  const stripe = stripeClient();
  if (!stripe) throw badRequest('Stripe is not configured');
  const companyId = req.auth.companyId!;
  const company = await client.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const c = company.rows[0];
  if (!c) throw notFound('Company');
  const plan = await client.query(`SELECT * FROM subscription_plans WHERE id = $1`, [body.planId]);
  if (!plan.rowCount) throw notFound('Plan');
  const p = plan.rows[0];
  const priceData = priceDataForPlan(p, body.planId, body.interval);

  let customerId = c.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: c.email,
      name: c.name,
      metadata: { companyId },
    });
    customerId = customer.id;
    await client.query(`UPDATE companies SET stripe_customer_id = $2 WHERE id = $1`, [companyId, customerId]);
  }

  let existingSub: Stripe.Subscription | null = null;
  if (c.stripe_subscription_id) {
    try {
      existingSub = await stripe.subscriptions.retrieve(c.stripe_subscription_id as string);
    } catch {
      existingSub = null;
    }
  }
  if (!existingSub || !LIVE_SUB_STATUSES.has(existingSub.status)) {
    const listed = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
    existingSub = listed.data.find((s) => LIVE_SUB_STATUSES.has(s.status)) || null;
  }

  if (existingSub && LIVE_SUB_STATUSES.has(existingSub.status)) {
    const item = existingSub.items.data[0];
    if (!item) throw badRequest('Subscription has no items to update');
    const priceId = await stripePriceIdForPlan(stripe, p, body.planId, body.interval);
    const endingTrial = existingSub.status === 'trialing';
    const updated = await stripe.subscriptions.update(existingSub.id, {
      items: [{ id: item.id, price: priceId }],
      metadata: { companyId, planId: body.planId, interval: body.interval },
      proration_behavior: endingTrial ? 'none' : 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
      expand: ['latest_invoice'],
      ...(endingTrial ? { trial_end: 'now' as const } : {}),
    });
    await persistStripeSubscription(companyId, updated, c.status as string, client, body.planId);
    await syncCompanyBillingFromStripe(companyId, client);

    const latest = updated.latest_invoice;
    const invoice = typeof latest === 'string' ? await stripe.invoices.retrieve(latest) : latest;
    if (invoice && invoice.status !== 'paid' && invoice.hosted_invoice_url) {
      res.json({ url: invoice.hosted_invoice_url, applied: false });
      return;
    }
    res.json({ url: null, applied: true });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_collection: 'always',
    line_items: [{ quantity: 1, price_data: priceData }],
    success_url: `${publicAppUrl()}/admin/settings?tab=billing&checkout=success`,
    cancel_url: `${publicAppUrl()}/admin/settings?tab=billing&checkout=cancel`,
    metadata: { companyId, planId: body.planId, interval: body.interval },
    subscription_data: {
      metadata: { companyId, planId: body.planId, interval: body.interval },
    },
  });
  res.json({ url: session.url, applied: false });
}));

billingRouter.post('/portal', tenantRoute(async (req, res, client) => {
  const stripe = stripeClient();
  if (!stripe) throw badRequest('Stripe is not configured');
  const { rows } = await client.query(`SELECT stripe_customer_id FROM companies WHERE id = $1`, [req.auth.companyId]);
  if (!rows[0]?.stripe_customer_id) throw badRequest('No billing customer yet. Start a subscription first.');
  const portal = await stripe.billingPortal.sessions.create({
    customer: rows[0].stripe_customer_id,
    return_url: `${publicAppUrl()}/admin/settings?tab=billing&checkout=success`,
  });
  res.json({ url: portal.url });
}));
