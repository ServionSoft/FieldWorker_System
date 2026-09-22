import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Check, CreditCard, ExternalLink, FileText, Loader2 } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  price: number;
  features?: string[];
  featureKeys?: string[];
  maxWorkers?: number;
  maxJobs?: number;
};

type SubInvoice = {
  id: string;
  number?: string | null;
  amount: number;
  currency?: string;
  status: string;
  hostedUrl?: string | null;
  pdfUrl?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  createdAt: string;
};

function money(amount: number, currency = 'usd') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `$${Number(amount || 0).toLocaleString()}`;
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'paid') return 'success' as const;
  if (s === 'trial' || s === 'trialing' || s === 'open' || s === 'draft') return 'warning' as const;
  if (s === 'past_due' || s === 'unpaid' || s === 'uncollectible') return 'destructive' as const;
  if (s === 'suspended' || s === 'canceled' || s === 'void') return 'secondary' as const;
  return 'secondary' as const;
}

function statusLabel(status?: string) {
  const s = (status || 'unknown').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isUnpaid(status?: string) {
  const s = (status || '').toLowerCase();
  return s === 'open' || s === 'draft' || s === 'uncollectible' || s === 'past_due';
}

function billingLooksCurrent(data: any) {
  const status = String(data?.subscription?.status || '').toLowerCase();
  const invoices: SubInvoice[] = data?.invoices || [];
  const hasOpen = invoices.some((i) => isUnpaid(i.status));
  return (status === 'active' || status === 'trial') && !hasOpen;
}

export function BillingSettings() {
  const [params, setParams] = useSearchParams();
  const hydrate = useAppStore((s) => s.hydrate);
  const [billing, setBilling] = useState<any>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const load = async () => {
    try {
      const data = await api.billing.get();
      setBilling(data);
      await hydrate();
      return data;
    } catch {
      toast.error('Could not load billing');
      return null;
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const checkout = params.get('checkout');
    if (!checkout) return;

    if (checkout === 'cancel') {
      toast.message('Checkout canceled');
    }

    let cancelled = false;
    const run = async () => {
      if (checkout === 'success') {
        toast.success('Payment received. Updating subscription…');
        for (let i = 0; i < 6 && !cancelled; i += 1) {
          const data = await load();
          if (data && billingLooksCurrent(data)) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
      } else {
        await load();
      }
      if (cancelled) return;
      const next = new URLSearchParams(params);
      next.delete('checkout');
      setParams(next, { replace: true });
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const startCheckout = async (planId: string) => {
    setCheckoutId(planId);
    try {
      const result = await api.billing.checkout(planId, 'monthly');
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast.success(result.applied ? 'Plan updated' : 'Subscription updated');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Checkout failed');
    } finally {
      setCheckoutId(null);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { url } = await api.billing.portal();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not open billing portal');
      setPortalBusy(false);
    }
  };

  if (!billing) {
    return <p className="text-sm text-muted-foreground">Loading billing…</p>;
  }

  const sub = billing.subscription || {};
  const plans: Plan[] = [...(billing.plans || [])].sort((a: Plan, b: Plan) => a.price - b.price);
  const invoices: SubInvoice[] = billing.invoices || [];
  const currentPlanId = sub.planId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Current plan</CardTitle>
              <CardDescription className="mt-1">
                Monthly subscription is billed automatically by Stripe. Change plan below or manage the card on file.
              </CardDescription>
            </div>
            <Badge variant={statusBadge(sub.status)}>{statusLabel(sub.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-2xl font-heading font-semibold">{sub.planName || 'No plan'}</p>
            {sub.status === 'trial' && sub.trialEndsAt && (
              <p className="text-sm text-muted-foreground mt-1">Trial ends {fmtDate(sub.trialEndsAt)}. Subscribe now to be billed today — the first invoice appears after payment.</p>
            )}
            {(sub.featureKeys || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {(sub.featureKeys as string[]).map((k) => (
                  <Badge key={k} variant="secondary">{k.replace(/_/g, ' ')}</Badge>
                ))}
              </div>
            )}
          </div>

          {!billing.stripeConfigured && (
            <p className="text-sm text-warning">Stripe is not configured. Super Admin can assign plans manually.</p>
          )}

          {billing.stripeConfigured && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((p) => {
                  const current = p.id === currentPlanId;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border p-4 flex flex-col gap-3 ${
                        current ? 'border-primary bg-primary-light/40' : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{p.name}</p>
                          <p className="text-xl font-heading font-bold mt-0.5">
                            {money(p.price)}
                            <span className="text-sm font-normal text-muted-foreground">/mo</span>
                          </p>
                        </div>
                        {current && <Badge variant="success">Current</Badge>}
                      </div>
                      {(p.features || []).length > 0 && (
                        <ul className="space-y-1.5 text-xs text-muted-foreground flex-1">
                          {(p.features || []).slice(0, 4).map((f) => (
                            <li key={f} className="flex gap-1.5">
                              <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button
                        size="sm"
                        variant={current && sub.status !== 'trial' ? 'secondary' : 'outline'}
                        disabled={(current && sub.status !== 'trial') || checkoutId !== null}
                        onClick={() => { void startCheckout(p.id); }}
                      >
                        {checkoutId === p.id && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                        {current && sub.status !== 'trial'
                          ? 'Current plan'
                          : current
                            ? 'Subscribe now'
                            : `Switch to ${p.name}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button variant="secondary" disabled={portalBusy} onClick={() => { void openPortal(); }}>
                {portalBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                Payment methods & receipts
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subscription invoices</CardTitle>
          <CardDescription>
            These are FieldPro subscription invoices from Stripe — not customer job invoices. Paid invoices are receipts; open invoices can be paid on Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="After Stripe charges (or sends) a subscription invoice, it will appear here."
              className="py-8"
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{i.number || i.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(i.createdAt)}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadge(i.status)}>{statusLabel(i.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {money(i.amount, i.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {i.hostedUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={i.hostedUrl} target="_blank" rel="noreferrer">
                              {isUnpaid(i.status) ? 'Pay' : 'View'}
                              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
