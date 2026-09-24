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
import { Plus, Eye, Send, DollarSign, Search, Trash2 } from 'lucide-react';
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
  const { currentUser, invoices, updateInvoice, jobs, inventory, generateInvoiceFromJob } = useFieldPro();
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  const companyInvoices = invoices.filter(i => i.companyId === currentUser?.companyId);
  const invoiceJobs = jobs.filter(j => j.status !== 'cancelled' && j.billingType !== 'no_charge');
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<'job' | 'items'>('job');
  const [jobId, setJobId] = useState('');
  const [creating, setCreating] = useState(false);
  const [invSearch, setInvSearch] = useState('');
  const [laborDesc, setLaborDesc] = useState('Labor');
  const [laborQty, setLaborQty] = useState('1');
  const [laborRate, setLaborRate] = useState('');
  const [draftItems, setDraftItems] = useState<{ description: string; quantity: number; unitPrice: number }[]>([]);
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
  useUnsavedGuard(showCreate && (createStep === 'items' || !!jobId));

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

  const selectedJob = jobs.find(j => j.id === jobId);
  const taxRate = Number(selectedJob?.taxRate ?? 0);
  const draftSubtotal = draftItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const draftTax = +(draftSubtotal * (taxRate / 100)).toFixed(2);
  const catalog = inventory.filter((i) =>
    !invSearch.trim()
    || i.name.toLowerCase().includes(invSearch.toLowerCase())
    || i.sku.toLowerCase().includes(invSearch.toLowerCase()),
  );

  const resetCreate = () => {
    setShowCreate(false);
    setCreateStep('job');
    setJobId('');
    setDraftItems([]);
    setInvSearch('');
    setLaborDesc('Labor');
    setLaborQty('1');
    setLaborRate('');
  };

  const handleAction = (id: string, status: string) => {
    updateInvoice(id, { status: status as Invoice['status'] });
    toast.success(`Invoice marked as ${status}`);
    if (showDetail) setShowDetail({ ...showDetail, status: status as Invoice['status'] });
  };

  const addLaborLine = () => {
    const description = laborDesc.trim() || 'Labor';
    const quantity = Number(laborQty);
    const unitPrice = Number(laborRate);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Enter labor hours / quantity');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error('Enter labor rate');
      return;
    }
    setDraftItems((prev) => [...prev, { description, quantity, unitPrice }]);
    setLaborQty('1');
    setLaborRate('');
  };

  const addInventoryLine = (item: { id: string; name: string; unitPrice: number }) => {
    setDraftItems((prev) => {
      const existing = prev.find((l) => l.description === item.name);
      if (existing) {
        return prev.map((l) => l.description === item.name ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { description: item.name, quantity: 1, unitPrice: Number(item.unitPrice) || 0 }];
    });
  };

  const handleCreate = async () => {
    if (!jobId) {
      toast.error('Select a job to invoice');
      return;
    }
    if (createStep === 'job') {
      const job = jobs.find(j => j.id === jobId);
      if (job?.invoiceId) {
        toast.error('This job already has an invoice');
        return;
      }
      const existing = (job?.lineItems ?? []).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      }));
      setDraftItems(existing);
      setCreateStep('items');
      return;
    }
    if (!draftItems.length) {
      toast.error('Add labor or at least one line item');
      return;
    }
    setCreating(true);
    try {
      const id = await generateInvoiceFromJob(jobId, draftItems);
      const created = await api.invoices.get(id);
      toast.success(`Invoice ${created.invoiceNumber} created`);
      resetCreate();
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
                  {listQ.isLoading ? 'Loading…' : filtersOn ? 'No invoices match these filters.' : 'No invoices yet. Create one from a job and add inventory line items.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody></Table>
        </div>
        <ListPager page={page} pageSize={prefs.pageSize} total={total} onPage={setPage} onPageSize={prefs.setPageSize} />
      </CardContent></Card>
      <Dialog open={showCreate} onOpenChange={(open) => {
        if (!open && !confirmDiscard(createStep === 'items' || !!jobId)) return;
        if (!open) resetCreate();
        else setShowCreate(true);
      }}>
        <DialogContent className={createStep === 'items' ? 'max-w-2xl' : undefined}>
          <DialogHeader>
            <DialogTitle>{createStep === 'job' ? 'Create Invoice' : 'Add line items'}</DialogTitle>
          </DialogHeader>
          {createStep === 'job' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Job</Label>
                {invoiceJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs available to invoice.</p>
                ) : (
                  <Select value={jobId} onValueChange={setJobId}>
                    <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
                    <SelectContent>
                      {invoiceJobs.map(j => (
                        <SelectItem key={j.id} value={j.id} disabled={Boolean(j.invoiceId)}>
                          {j.title} — {j.customerName}{j.invoiceId ? ' (invoiced)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {invoiceJobs.length === 0 && (
                <Button variant="outline" onClick={() => navigate('/admin/jobs')}>Go to Jobs</Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedJob?.title} — {selectedJob?.customerName}. Inventory is optional — you can add labor only.
              </p>
              <div className="rounded-lg border p-3 space-y-2">
                <Label>Labor</Label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_6rem_auto] gap-2">
                  <Input value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} placeholder="Labor" />
                  <Input type="number" min={0} step="0.25" value={laborQty} onChange={(e) => setLaborQty(e.target.value)} placeholder="Hours" />
                  <Input type="number" min={0} step="0.01" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder="Rate $" />
                  <Button type="button" variant="outline" onClick={addLaborLine}>Add labor</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Inventory</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search inventory..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)} className="pl-10 h-9" />
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                  {catalog.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No inventory items. Add stock on the Inventory page.</p>
                  ) : catalog.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.sku} · ${Number(item.unitPrice).toFixed(2)} · stock {item.quantity}</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" onClick={() => addInventoryLine(item)}>Add</Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Line items</Label>
                {draftItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add labor and/or inventory items.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-20">Qty</TableHead>
                        <TableHead className="w-24">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftItems.map((li, idx) => (
                        <TableRow key={`${li.description}-${idx}`}>
                          <TableCell className="text-sm">{li.description}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.25"
                              className="h-8 w-16"
                              value={li.quantity}
                              onChange={(e) => {
                                const quantity = Math.max(0.01, Number(e.target.value) || 1);
                                setDraftItems((prev) => prev.map((row, i) => i === idx ? { ...row, quantity } : row));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 w-20"
                              value={li.unitPrice}
                              onChange={(e) => {
                                const unitPrice = Math.max(0, Number(e.target.value) || 0);
                                setDraftItems((prev) => prev.map((row, i) => i === idx ? { ...row, unitPrice } : row));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm">${(li.quantity * li.unitPrice).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {draftItems.length > 0 && (
                  <div className="text-sm text-right space-y-0.5">
                    <p>Subtotal: ${draftSubtotal.toFixed(2)}</p>
                    <p>Tax ({taxRate}%): ${draftTax.toFixed(2)}</p>
                    <p className="font-medium">Total: ${(draftSubtotal + draftTax).toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {createStep === 'items' ? (
              <Button variant="outline" onClick={() => setCreateStep('job')}>Back</Button>
            ) : (
              <Button variant="outline" onClick={resetCreate}>Cancel</Button>
            )}
            <Button
              onClick={handleCreate}
              disabled={creating || !jobId || (createStep === 'items' && draftItems.length === 0)}
              className="gradient-primary text-primary-foreground"
            >
              {creating ? 'Creating…' : createStep === 'job' ? 'Continue' : 'Create Invoice'}
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
