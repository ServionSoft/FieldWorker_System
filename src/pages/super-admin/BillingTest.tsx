import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, PauseCircle, RotateCcw } from 'lucide-react';

type Action = 'payment_failed' | 'payment_paid' | 'suspended' | 'restore_active';

function statusVariant(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'paid') return 'success' as const;
  if (s === 'trial' || s === 'open') return 'warning' as const;
  if (s === 'past_due' || s === 'unpaid') return 'destructive' as const;
  return 'secondary' as const;
}

export default function BillingTest() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const startImpersonation = useAppStore((s) => s.startImpersonation);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState(params.get('companyId') || '');
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  const loadCompanies = async () => {
    try {
      setCompanies(await api.platform.companies());
    } catch (e: any) {
      toast.error(e.message || 'Could not load companies');
    }
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await api.platform.getCompany(id));
    } catch (e: any) {
      toast.error(e.message || 'Could not load company');
    }
  };

  useEffect(() => { void loadCompanies(); }, []);
  useEffect(() => { void loadDetail(companyId); }, [companyId]);

  const selectCompany = (id: string) => {
    setCompanyId(id);
    const next = new URLSearchParams(params);
    if (id) next.set('companyId', id);
    else next.delete('companyId');
    setParams(next, { replace: true });
  };

  const run = async (action: Action) => {
    if (!companyId) return;
    setBusy(action);
    try {
      const r = await api.platform.billingTest(companyId, action);
      toast.success(`Company is now ${r.status.replace('_', ' ')}`);
      await loadDetail(companyId);
    } catch (e: any) {
      toast.error(e.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const impersonate = async () => {
    if (!companyId) return;
    try {
      const r = await api.platform.impersonate(companyId);
      await startImpersonation(r.accessToken);
      navigate('/admin/settings?tab=billing');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const invoices = detail?.billingInvoices || [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-heading font-bold">Billing test</h1>
        <p className="text-sm text-muted-foreground">
          Super Admin only. Applies the same CRM effects as Stripe webhooks so you can inspect unpaid invoices and tenant lockout without waiting a billing cycle.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Writes real tenant data</AlertTitle>
        <AlertDescription>
          Status, invoices, and billing notifications update in this database. Stripe Dashboard is unchanged. Restore Active when you are done.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Company</CardTitle>
          <CardDescription>Pick a tenant, simulate a payment outcome, then impersonate to see Settings → Billing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={companyId || undefined} onValueChange={selectCompany}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} · {c.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {detail && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{detail.name}</span>
              <Badge variant={statusVariant(detail.status)}>{String(detail.status || '').replace(/_/g, ' ')}</Badge>
              <span className="text-muted-foreground">{detail.planName}</span>
              <Button variant="outline" size="sm" onClick={impersonate}>Impersonate → Billing</Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={!companyId || !!busy} onClick={() => run('payment_failed')}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              {busy === 'payment_failed' ? 'Working…' : 'Simulate payment failed'}
            </Button>
            <Button disabled={!companyId || !!busy} onClick={() => run('payment_paid')}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {busy === 'payment_paid' ? 'Working…' : 'Simulate paid'}
            </Button>
            <Button variant="secondary" disabled={!companyId || !!busy} onClick={() => run('suspended')}>
              <PauseCircle className="w-4 h-4 mr-2" />
              {busy === 'suspended' ? 'Working…' : 'Simulate unpaid / suspended'}
            </Button>
            <Button variant="outline" disabled={!companyId || !!busy} onClick={() => run('restore_active')}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {busy === 'restore_active' ? 'Working…' : 'Restore active'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aftermath</CardTitle>
          <CardDescription>
            Failed → status past_due, open invoice, tenant banner. Unpaid/suspended → tenant API blocked. Paid → status active, latest open invoice marked paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="text-sm">{i.number || '—'}</TableCell>
                  <TableCell><Badge variant={statusVariant(i.status)}>{i.status}</Badge></TableCell>
                  <TableCell className="text-sm">${Number(i.amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!detail && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">Select a company.</TableCell>
                </TableRow>
              )}
              {detail && invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">No billing invoices yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
