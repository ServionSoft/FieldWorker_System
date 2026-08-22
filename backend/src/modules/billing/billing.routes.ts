import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission, requireRole, requireTenant } from '../../middleware/rbac.js';
import { tenantRoute } from '../../middleware/tenant.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { stripeClient, stripeConfigured, publicAppUrl } from '../../services/stripe.js';
import { wrap } from '../../utils/async.js';
import { pool } from '../../db/pool.js';

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

export const publicPlansRouter = Router();
publicPlansRouter.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM subscription_plans ORDER BY price_cents`);
  res.json({ items: rows.map(mapPlan), stripeConfigured: stripeConfigured() });
}));

export const billingRouter = Router();
billingRouter.use(requireAuth, requireTenant, requireRole('admin'), requirePermission('billing.manage'));

billingRouter.get('/', tenantRoute(async (req, res, client) => {
  const companyId = req.auth.companyId!;
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
  res.json({
    stripeConfigured: stripeConfigured(),
    subscription: {
      planId: c.plan_id,
      planName: c.plan_name,
      status: c.status,
      trialEndsAt: c.trial_ends_at ? c.trial_ends_at.toISOString() : null,
      stripeCustomerId: c.stripe_customer_id,
      stripeSubscriptionId: c.stripe_subscription_id,
      featureKeys: c.feature_keys ?? [],
    },
    invoices: invoices.rows.map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount_cents / 100,
      currency: i.currency,
      status: i.status,
      hostedUrl: i.hosted_url,
      pdfUrl: i.pdf_url,
      periodStart: i.period_start ? i.period_start.toISOString() : null,
      periodEnd: i.period_end ? i.period_end.toISOString() : null,
      createdAt: i.created_at.toISOString(),
    })),
    plans: plans.rows.map(mapPlan),
  });
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
  const amountCents = body.interval === 'yearly'
    ? Number(p.price_cents_yearly ?? p.price_cents * 12)
    : Number(p.price_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw badRequest('Plan price is not configured');

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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(amountCents),
        recurring: { interval: body.interval === 'yearly' ? 'year' : 'month' },
        product_data: {
          name: `FieldPro ${p.name}`,
          metadata: { planId: body.planId },
        },
      },
    }],
    success_url: `${publicAppUrl()}/admin/settings?tab=billing&checkout=success`,
    cancel_url: `${publicAppUrl()}/admin/settings?tab=billing&checkout=cancel`,
    metadata: { companyId, planId: body.planId, interval: body.interval },
    subscription_data: {
      metadata: { companyId, planId: body.planId, interval: body.interval },
      trial_period_days: c.status === 'trial'
        ? (await client.query(`SELECT trial_days FROM platform_settings WHERE id = 1`)).rows[0]?.trial_days ?? 14
        : undefined,
    },
  });
  res.json({ url: session.url });
}));

billingRouter.post('/portal', tenantRoute(async (req, res, client) => {
  const stripe = stripeClient();
  if (!stripe) throw badRequest('Stripe is not configured');
  const { rows } = await client.query(`SELECT stripe_customer_id FROM companies WHERE id = $1`, [req.auth.companyId]);
  if (!rows[0]?.stripe_customer_id) throw badRequest('No billing customer yet. Start a subscription first.');
  const portal = await stripe.billingPortal.sessions.create({
    customer: rows[0].stripe_customer_id,
    return_url: `${publicAppUrl()}/admin/settings?tab=billing`,
  });
  res.json({ url: portal.url });
}));
