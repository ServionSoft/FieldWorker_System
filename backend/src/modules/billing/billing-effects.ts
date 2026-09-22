import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenant } from '../../db/pool.js';
import { notifyByPermission, notifyPlatformAdmins } from '../../utils/helpers.js';

export type BillingInvoiceInput = {
  id: string;
  number?: string | null;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  status?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  period_start?: number | null;
  period_end?: number | null;
};

async function inTenant<T>(companyId: string, client: PoolClient | undefined, fn: (c: PoolClient) => Promise<T>) {
  if (client) return fn(client);
  return withTenant(companyId, null, true, fn);
}

export async function upsertBillingInvoice(companyId: string, inv: BillingInvoiceInput, client?: PoolClient) {
  await inTenant(companyId, client, async (c) => {
    await c.query(
      `INSERT INTO billing_invoices (
         company_id, stripe_invoice_id, number, amount_cents, currency, status, hosted_url, pdf_url, period_start, period_end
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9), to_timestamp($10))
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         status = excluded.status, hosted_url = excluded.hosted_url, pdf_url = excluded.pdf_url,
         amount_cents = excluded.amount_cents, number = excluded.number,
         period_start = excluded.period_start, period_end = excluded.period_end`,
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

export async function applyPaymentFailed(
  company: { id: string; name: string },
  inv?: BillingInvoiceInput,
  client?: PoolClient,
) {
  await inTenant(company.id, client, async (c) => {
    if (inv) await upsertBillingInvoice(company.id, inv, c);
    await c.query(
      `UPDATE companies SET status = 'past_due' WHERE id = $1 AND status <> 'suspended'`,
      [company.id],
    );
    await notifyByPermission(c, company.id, 'billing.manage', {
      title: 'Payment failed',
      message: 'A subscription payment failed. Update your card to avoid interruption.',
      type: 'error',
      eventKey: 'billing.payment_failed',
      linkPath: '/admin/settings?tab=billing',
      emailPref: 'billing',
    });
    await notifyPlatformAdmins(c, 'Tenant payment failed', `${company.name} has a failed subscription payment`, {
      eventKey: 'billing.payment_failed',
      linkPath: `/super-admin/companies/${company.id}`,
    });
  });
}

export async function applyPaymentPaid(companyId: string, inv?: BillingInvoiceInput, client?: PoolClient) {
  await inTenant(companyId, client, async (c) => {
    if (inv) await upsertBillingInvoice(companyId, { ...inv, status: inv.status || 'paid' }, c);
    await c.query(
      `UPDATE companies SET
         trial_ends_at = CASE WHEN status = 'suspended' THEN trial_ends_at ELSE NULL END,
         status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END
       WHERE id = $1`,
      [companyId],
    );
    await notifyByPermission(c, companyId, 'billing.manage', {
      title: 'Invoice paid',
      message: `Subscription invoice ${inv?.number || ''} was paid.`,
      type: 'success',
      eventKey: 'billing.invoice_paid',
      linkPath: '/admin/settings?tab=billing',
      emailPref: 'billing',
    });
  });
}

export async function applySubscriptionSuspended(companyId: string, client?: PoolClient) {
  await inTenant(companyId, client, async (c) => {
    await c.query(`UPDATE companies SET status = 'suspended' WHERE id = $1`, [companyId]);
  });
}

export function simulationInvoice(amountCents: number, status: 'open' | 'paid'): BillingInvoiceInput {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `sim_${randomUUID()}`,
    number: `TEST-${Date.now().toString().slice(-6)}`,
    amount_due: amountCents,
    amount_paid: status === 'paid' ? amountCents : 0,
    currency: 'usd',
    status,
    hosted_invoice_url: null,
    period_start: now,
    period_end: now + 30 * 24 * 60 * 60,
  };
}
