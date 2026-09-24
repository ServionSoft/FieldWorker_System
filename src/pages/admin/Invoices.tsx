import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Send, DollarSign, Search, Trash2, FileText, Download, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Estimate, Invoice, InvoiceItem } from '@/store/types';
import { ListPager } from '@/components/crm/ListPager';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';
import { ColumnPicker } from '@/components/crm/ColumnPicker';
import { RecordMarks } from '@/components/crm/RecordMarks';

const statusColors: Record<string, string> = { draft: 'tint-slate', sent: 'tint-info', paid: 'tint-success', overdue: 'tint-danger' };

type DraftLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryId: string;
};

const emptyDraftLine = (): DraftLine => ({ description: '', quantity: 1, unitPrice: 0, inventoryId: '' });

const AdminInvoices = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { currentUser, invoices, updateInvoice, jobs, inventory, estimates, generateInvoiceFromJob } = useFieldPro();
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  const companyInvoices = invoices.filter(i => i.companyId === currentUser?.companyId);
  const invoiceJobs = jobs.filter(j => j.status !== 'cancelled' && j.billingType !== 'no_charge');
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<'job' | 'items'>('job');
  const [jobId, setJobId] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftLine[]>([]);
  const [pickedEstimateId, setPickedEstimateId] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editDue, setEditDue] = useState('');
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
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
  const jobEstimates = estimates.filter((e) =>
    e.convertedJobId === jobId || (!!selectedJob?.estimateId && e.id === selectedJob.estimateId),
  );
  const taxRate = Number(selectedJob?.taxRate ?? 0);
  const billedItems = draftItems.filter((i) => i.description.trim());
  const draftSubtotal = billedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const draftTax = +(draftSubtotal * (taxRate / 100)).toFixed(2);

  const toDraftLine = (li: { description: string; quantity: number; unitPrice: number }): DraftLine => {
    const match = inventory.find((x) => x.name === li.description);
    return {
      description: li.description,
      quantity: Number(li.quantity) || 1,
      unitPrice: Number(li.unitPrice) || 0,
      inventoryId: match?.id ?? (li.description.trim() ? '__custom__' : ''),
    };
  };

  const resetCreate = () => {
    setShowCreate(false);
    setCreateStep('job');
    setJobId('');
    setDraftItems([]);
    setPickedEstimateId('');
  };

  const handleAction = (id: string, status: string) => {
    updateInvoice(id, { status: status as Invoice['status'] });
    toast.success(`Invoice marked as ${status}`);
    if (showDetail) setShowDetail({ ...showDetail, status: status as Invoice['status'] });
  };

  const closePdfPreview = () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const viewPdf = async (inv: Invoice) => {
    setPdfBusy(inv.id);
    try {
      const { blob, filename } = await api.invoices.pdf(inv.id);
      closePdfPreview();
      setShowDetail(null);
      setEditing(false);
      setPdfPreview({
        url: URL.createObjectURL(blob),
        name: filename || `${inv.invoiceNumber}.pdf`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not open PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const downloadPdf = async (inv: Invoice) => {
    setPdfBusy(inv.id);
    try {
      const { blob, filename } = await api.invoices.pdf(inv.id, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not download PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const startEdit = async (inv: Invoice) => {
    try {
      const full = await api.invoices.get(inv.id) as Invoice;
      if (full.status === 'paid') {
        toast.error('Paid invoices cannot be edited');
        return;
      }
      setShowDetail(full);
      setEditItems((full.items ?? []).map((i) => ({ ...i })));
      setEditDue(full.dueDate);
      setEditing(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not load invoice');
    }
  };

  const updateEditLine = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setEditItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value } as InvoiceItem;
      if (field === 'quantity' || field === 'unitPrice') {
        row.total = Number(row.quantity) * Number(row.unitPrice);
      }
      next[index] = row;
      return next;
    });
  };

  const saveEdit = async () => {
    if (!showDetail) return;
    const cleaned = editItems
      .map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
      }))
      .filter((i) => i.description);
    if (!cleaned.length || cleaned.some((i) => i.quantity <= 0 || i.unitPrice < 0)) {
      toast.error('Add at least one line item with quantity greater than 0');
      return;
    }
    setSavingEdit(true);
    try {
      const saved = await api.invoices.update(showDetail.id, { items: cleaned, dueDate: editDue || undefined });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      setShowDetail(saved);
      setEditing(false);
      toast.success('Invoice updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update invoice');
    } finally {
      setSavingEdit(false);
    }
  };

  const applyInventoryItem = (index: number, inventoryId: string) => {
    setDraftItems((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (inventoryId === '__custom__') {
        return { ...row, description: '', inventoryId: '__custom__' };
      }
      const inv = inventory.find((x) => x.id === inventoryId);
      if (!inv) return row;
      return {
        ...row,
        description: inv.name,
        unitPrice: Number(inv.unitPrice) || 0,
        inventoryId,
      };
    }));
  };

  const updateDraftLine = (index: number, field: 'description' | 'quantity' | 'unitPrice', value: string | number) => {
    setDraftItems((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (field === 'description') return { ...row, description: String(value) };
      if (field === 'quantity') return { ...row, quantity: Number(value) || 0 };
      return { ...row, unitPrice: Number(value) || 0 };
    }));
  };

  const applyEstimateItems = (est: Estimate) => {
    const items = (est.items ?? [])
      .filter((li) => li.description?.trim())
      .map((li) => toDraftLine({
        description: li.description,
        quantity: Number(li.quantity) || 1,
        unitPrice: Number(li.unitPrice) || 0,
      }));
    if (!items.length) {
      toast.error(`${est.estimateNumber} has no line items`);
      return;
    }
    setDraftItems(items);
    toast.success(`Loaded ${items.length} line items from ${est.estimateNumber}`);
  };

  const loadFromEstimates = async () => {
    let linked = jobEstimates;
    if (!linked.length && selectedJob?.estimateId) {
      try {
        const fetched = await api.estimates.get(selectedJob.estimateId) as Estimate;
        if (fetched?.id) linked = [fetched];
      } catch {
        // estimate missing or not readable
      }
    }
    if (!linked.length) {
      toast.error('No estimate on this job');
      return;
    }
    const est = linked.length === 1
      ? linked[0]
      : linked.find((e) => e.id === pickedEstimateId) ?? linked[0];
    applyEstimateItems(est);
  };

  const handleCreate = async () => {
    if (!jobId) {
      toast.error('Select a job to invoice');
      return;
    }
    if (createStep === 'job') {
      const job = jobs.find(j => j.id === jobId);
      const existing = (job?.lineItems ?? [])
        .filter((li) => li.description?.trim())
        .map((li) => toDraftLine({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        }));
      setDraftItems(existing.length ? existing : [emptyDraftLine()]);
      const linked = estimates.filter((e) =>
        e.convertedJobId === jobId || (!!job?.estimateId && e.id === job.estimateId),
      );
      setPickedEstimateId(linked[0]?.id ?? '');
      setCreateStep('items');
      return;
    }
    const items = billedItems.map((i) => ({
      description: i.description.trim(),
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));
    if (!items.length || items.some((i) => i.quantity <= 0 || i.unitPrice < 0)) {
      toast.error('Add at least one line item with quantity greater than 0');
      return;
    }
    setCreating(true);
    try {
      const id = await generateInvoiceFromJob(jobId, items);
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
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="View PDF" disabled={pdfBusy === inv.id} onClick={() => void viewPdf(inv)}>
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF" disabled={pdfBusy === inv.id} onClick={() => void downloadPdf(inv)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  {inv.status !== 'paid' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit invoice" onClick={() => void startEdit(inv)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Details" onClick={() => { setEditing(false); setShowDetail(inv); }}><Eye className="w-4 h-4" /></Button>
                  {inv.status === 'draft' && <Button variant="ghost" size="icon" className="h-8 w-8" title="Send" onClick={() => handleAction(inv.id, 'sent')}><Send className="w-4 h-4" /></Button>}
                  {inv.status === 'sent' && <Button variant="ghost" size="icon" className="h-8 w-8" title="Mark paid" onClick={() => handleAction(inv.id, 'paid')}><DollarSign className="w-4 h-4" /></Button>}
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
                        <SelectItem key={j.id} value={j.id}>
                          {j.title} — {j.customerName}
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
                {selectedJob?.title} — {selectedJob?.customerName}. Select an inventory item or Custom line.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {jobEstimates.length > 1 && (
                  <Select value={pickedEstimateId} onValueChange={setPickedEstimateId}>
                    <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Select estimate" /></SelectTrigger>
                    <SelectContent>
                      {jobEstimates.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.estimateNumber} · ${Number(e.total).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button type="button" variant="outline" size="sm" onClick={loadFromEstimates}>
                  Load from estimates
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDraftItems((prev) => [...prev, emptyDraftLine()])}>
                    <Plus className="w-3 h-3 mr-1" /> Add Item
                  </Button>
                </div>
                {inventory.length === 0 && (
                  <p className="text-xs text-muted-foreground">No inventory items yet. Add stock on the Inventory page, or choose Custom line.</p>
                )}
                {draftItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      <Select value={item.inventoryId || undefined} onValueChange={(v) => applyInventoryItem(idx, v)}>
                        <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom__">Custom line</SelectItem>
                          {inventory.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>{inv.name} · ${Number(inv.unitPrice).toFixed(2)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.inventoryId === '__custom__' && (
                        <Input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateDraftLine(idx, 'description', e.target.value)}
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateDraftLine(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Rate" value={item.unitPrice} onChange={(e) => updateDraftLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2 text-sm font-medium text-right pt-2">${(item.quantity * item.unitPrice).toFixed(2)}</div>
                    <div className="col-span-1">
                      {draftItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {billedItems.length > 0 && (
                  <div className="text-sm text-right space-y-0.5 border-t pt-2">
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
              disabled={creating || !jobId || (createStep === 'items' && billedItems.length === 0)}
              className="gradient-primary text-primary-foreground"
            >
              {creating ? 'Creating…' : createStep === 'job' ? 'Continue' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showDetail} onOpenChange={(open) => {
        if (!open) {
          setShowDetail(null);
          setEditing(false);
        }
      }}>
        <DialogContent className={editing ? 'max-w-2xl' : 'max-w-lg'}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${showDetail?.invoiceNumber}` : showDetail?.invoiceNumber}</DialogTitle>
          </DialogHeader>
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
              {editing ? (
                <>
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Line items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }])}>
                      <Plus className="w-3 h-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  {editItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <Input placeholder="Description" value={item.description} onChange={(e) => updateEditLine(idx, 'description', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateEditLine(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Rate" value={item.unitPrice} onChange={(e) => updateEditLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-2 text-sm font-medium text-right pt-2">${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}</div>
                      <div className="col-span-1">
                        {editItems.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>{showDetail.items.map((item, i) => (<TableRow key={i}><TableCell className="text-sm">{item.description}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>${item.unitPrice}</TableCell><TableCell className="text-right">${item.total.toFixed(2)}</TableCell></TableRow>))}</TableBody>
                </Table>
              )}
              <div className="border-t pt-3 space-y-1 text-sm text-right">
                {editing ? (
                  <>
                    <p>Subtotal: ${editItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0).toFixed(2)}</p>
                    <p className="text-muted-foreground">Tax and total are recalculated when you save.</p>
                  </>
                ) : (
                  <>
                    <p>Subtotal: ${showDetail.amount.toFixed(2)}</p><p>Tax: ${showDetail.tax.toFixed(2)}</p><p className="font-bold text-base">Total: ${showDetail.total.toFixed(2)}</p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {editing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" disabled={savingEdit} onClick={() => void saveEdit()}>{savingEdit ? 'Saving…' : 'Save invoice'}</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="gap-1" disabled={pdfBusy === showDetail.id} onClick={() => void viewPdf(showDetail)}>
                      <FileText className="w-4 h-4" /> View PDF
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1" disabled={pdfBusy === showDetail.id} onClick={() => void downloadPdf(showDetail)}>
                      <Download className="w-4 h-4" /> Download
                    </Button>
                    {showDetail.status !== 'paid' && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => void startEdit(showDetail)}>
                        <Pencil className="w-4 h-4" /> Edit
                      </Button>
                    )}
                    {showDetail.status === 'draft' && <Button size="sm" onClick={() => handleAction(showDetail.id, 'sent')}>Send Invoice</Button>}
                    {showDetail.status === 'sent' && <Button size="sm" onClick={() => handleAction(showDetail.id, 'paid')}>Mark Paid</Button>}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!pdfPreview} onOpenChange={(open) => { if (!open) closePdfPreview(); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.name || 'Invoice PDF'}</DialogTitle>
          </DialogHeader>
          {pdfPreview && (
            <iframe src={pdfPreview.url} title="Invoice PDF" className="w-full flex-1 min-h-[70vh] rounded border" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default AdminInvoices;
