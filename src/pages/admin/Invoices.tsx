import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Send, DollarSign, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Invoice } from '@/store/types';
import { ListPager } from '@/components/crm/ListPager';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';
import { ColumnPicker } from '@/components/crm/ColumnPicker';
import { RecordMarks } from '@/components/crm/RecordMarks';

const statusColors: Record<string, string> = { draft: 'tint-slate', sent: 'tint-info', paid: 'tint-success', overdue: 'tint-danger' };

const AdminInvoices = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentUser, invoices, updateInvoice, jobs, generateInvoiceFromJob } = useFieldPro();
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  const companyInvoices = invoices.filter(i => i.companyId === currentUser?.companyId);
  const billableJobs = jobs.filter(j =>
    !j.invoiceId
    && j.status !== 'cancelled'
    && j.billingType !== 'no_charge'
    && (j.lineItems?.length ?? 0) > 0,
  );
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [jobId, setJobId] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const prefs = useTablePrefs('invoices', { customer: true, amount: true, status: true, due: true });
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, statusFilter, prefs.pageSize]);
  const listQ = useQuery({
    queryKey: ['invoices', 'page', debounced, statusFilter, page, prefs.pageSize],
    queryFn: () => api.invoices.page({ search: debounced, status: statusFilter, page, pageSize: prefs.pageSize }),
  });
  const rows = (listQ.data?.items ?? []) as Invoice[];
  const total = listQ.data?.total ?? 0;
  const filtersOn = search || statusFilter !== 'all';
  useUnsavedGuard(showCreate && !!jobId);

  useEffect(() => {
    const id = params.get('id');
    if (!id) return;
    const found = companyInvoices.find((i) => i.id === id);
    if (found) {
      setShowDetail(found);
      return;
    }
    api.invoices.get(id).then(setShowDetail).catch(() => toast.error('Invoice not found'));
  }, [params, companyInvoices]);

  useEffect(() => {
    if (!showDetail) return;
    track({ kind: 'invoice', id: showDetail.id, label: showDetail.invoiceNumber, href: `/admin/invoices?id=${showDetail.id}` });
  }, [showDetail, track]);

  const handleAction = (id: string, status: string) => {
    updateInvoice(id, { status: status as Invoice['status'] });
    toast.success(`Invoice marked as ${status}`);
    if (showDetail) setShowDetail({ ...showDetail, status: status as Invoice['status'] });
  };

  const handleCreate = async () => {
    if (!jobId) {
      toast.error('Select a job to invoice');
      return;
    }
    setCreating(true);
    try {
      const id = await generateInvoiceFromJob(jobId);
      const created = await api.invoices.get(id);
      toast.success(`Invoice ${created.invoiceNumber} created`);
      setShowCreate(false);
      setJobId('');
      setShowDetail(created);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not create invoice');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-heading font-bold">Invoices</h1><p className="text-muted-foreground text-sm">{total} invoices</p></div>
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Invoice</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {['draft', 'sent', 'paid', 'overdue'].map(s => (
          <Card key={s} className="shadow-theme-sm cursor-pointer" onClick={() => setStatusFilter(s)}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold">{companyInvoices.filter(i => i.status === s).length}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
              <p className="text-sm font-medium mt-1">${companyInvoices.filter(i => i.status === s).reduce((sum, i) => sum + i.total, 0).toFixed(2)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="shadow-theme-sm"><CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search invoice # or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          {filtersOn && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground shrink-0" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear</Button>
          )}
          <SavedViewsBar page="invoices" filters={{ search, status: statusFilter }} onApply={(f) => { setSearch(f.search || ''); setStatusFilter(f.status || 'all'); }} />
          <ColumnPicker columns={[{ id: 'customer', label: 'Customer' }, { id: 'amount', label: 'Amount' }, { id: 'status', label: 'Status' }, { id: 'due', label: 'Due date' }]} visible={prefs.visible} onToggle={prefs.setColumn} />
        </div>
        <div className="overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead className="w-16"></TableHead>
          <TableHead>Invoice</TableHead>
          {prefs.visible('customer') && <TableHead>Customer</TableHead>}
          {prefs.visible('amount') && <TableHead>Amount</TableHead>}
          {prefs.visible('status') && <TableHead>Status</TableHead>}
          {prefs.visible('due') && <TableHead>Due Date</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
          <TableBody>
            {rows.map(inv => (
            <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setShowDetail(inv)}>
              <TableCell onClick={(e) => e.stopPropagation()}><RecordMarks entityType="invoice" entityId={inv.id} /></TableCell>
              <TableCell className="font-medium text-sm">{inv.invoiceNumber}</TableCell>
              {prefs.visible('customer') && <TableCell className="text-sm">{inv.customerName}</TableCell>}
              {prefs.visible('amount') && <TableCell className="font-medium text-sm">${inv.total.toFixed(2)}</TableCell>}
              {prefs.visible('status') && <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status]}`}>{inv.status}</span></TableCell>}
              {prefs.visible('due') && <TableCell className="text-sm text-muted-foreground">{inv.dueDate}</TableCell>}
              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowDetail(inv)}><Eye className="w-4 h-4" /></Button>
                  {inv.status === 'draft' && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAction(inv.id, 'sent')}><Send className="w-4 h-4" /></Button>}
                  {inv.status === 'sent' && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAction(inv.id, 'paid')}><DollarSign className="w-4 h-4" /></Button>}
                </div>
              </TableCell>
            </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  {listQ.isLoading ? 'Loading…' : filtersOn ? 'No invoices match these filters.' : 'No invoices yet. Create one from a completed job with line items.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody></Table>
        </div>
        <ListPager page={page} pageSize={prefs.pageSize} total={total} onPage={setPage} onPageSize={prefs.setPageSize} />
      </CardContent></Card>
      <Dialog open={showCreate} onOpenChange={(open) => {
        if (!open && !confirmDiscard(!!jobId)) return;
        setShowCreate(open);
        if (!open) setJobId('');
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Job</Label>
              {billableJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No billable jobs with line items. Add line items on a job, then create an invoice from here or the job page.
                </p>
              ) : (
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
                  <SelectContent>
                    {billableJobs.map(j => {
                      const total = (j.lineItems ?? []).reduce((s, i) => s + i.total, 0);
                      return (
                        <SelectItem key={j.id} value={j.id}>
                          {j.title} — {j.customerName} (${total.toFixed(2)})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
            {billableJobs.length === 0 && (
              <Button variant="outline" onClick={() => navigate('/admin/jobs')}>Go to Jobs</Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !jobId} className="gradient-primary text-primary-foreground">
              {creating ? 'Creating…' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{showDetail?.invoiceNumber}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm gap-3">
                <span className="text-muted-foreground">
                  Customer:{' '}
                  {showDetail.customerId ? (
                    <button className="font-medium text-primary hover:underline" onClick={() => navigate(`/admin/customers/${showDetail.customerId}`)}>{showDetail.customerName}</button>
                  ) : <strong className="text-foreground">{showDetail.customerName}</strong>}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[showDetail.status]}`}>{showDetail.status}</span>
              </div>
              {showDetail.jobId && (
                <button className="text-sm text-primary hover:underline" onClick={() => navigate(`/admin/jobs/${showDetail.jobId}`)}>Open related job</button>
              )}
              <Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{showDetail.items.map((item, i) => (<TableRow key={i}><TableCell className="text-sm">{item.description}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>${item.unitPrice}</TableCell><TableCell className="text-right">${item.total.toFixed(2)}</TableCell></TableRow>))}</TableBody>
              </Table>
              <div className="border-t pt-3 space-y-1 text-sm text-right">
                <p>Subtotal: ${showDetail.amount.toFixed(2)}</p><p>Tax: ${showDetail.tax.toFixed(2)}</p><p className="font-bold text-base">Total: ${showDetail.total.toFixed(2)}</p>
              </div>
              <div className="flex gap-2 justify-end">
                {showDetail.status === 'draft' && <Button size="sm" onClick={() => handleAction(showDetail.id, 'sent')}>Send Invoice</Button>}
                {showDetail.status === 'sent' && <Button size="sm" onClick={() => handleAction(showDetail.id, 'paid')}>Mark Paid</Button>}
              </div>
            </div>
          )}
        </DialogContent></Dialog>
    </div>
  );
};
export default AdminInvoices;
