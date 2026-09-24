import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Eye, Trash2, Star, FileText, Download, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Estimate, EstimateStatus, EstimateLineItem } from '@/store/types';
import { motion } from 'framer-motion';
import { ListPager } from '@/components/crm/ListPager';
import { api } from '@/lib/api';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';
import { ColumnPicker } from '@/components/crm/ColumnPicker';
import { RecordMarks } from '@/components/crm/RecordMarks';
import { FieldError } from '@/components/crm/FieldError';
import { dateOrderError, taxRateError, timeOrderError } from '@/lib/formValidation';

const statusColors: Record<EstimateStatus, string> = {
  draft: 'tint-slate',
  sent: 'tint-info',
  approved: 'tint-success',
  rejected: 'tint-danger',
  converted: 'tint-purple',
};

const SOURCES = ['Website', 'Google', 'Referral', 'Yelp', 'Facebook', 'Repeat Customer', 'Walk-in', 'Other'];

const AdminEstimates = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { currentUser, customers, workers, inventory, addEstimate, deleteEstimate } = useFieldPro();
  const companyCustomers = customers.filter(c => c.companyId === currentUser?.companyId);
  const companyWorkers = workers.filter(w => w.companyId === currentUser?.companyId);
  const prefs = useTablePrefs('estimates', { customer: true, category: true, status: true, total: true, valid: true });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<Estimate | null>(null);
  const [creating, setCreating] = useState(false);
  const [estErrors, setEstErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [editItems, setEditItems] = useState<EstimateLineItem[]>([]);
  const [editValidUntil, setEditValidUntil] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const initialForm = {
    customerId: '', customerName: '', customerEmail: '', customerPhone: '',
    locationName: '', street: '', unit: '', city: '', state: '', zip: '', gatedProperty: false,
    category: 'plumbing' as const, description: '', poNumber: '',
    referralSource: '', tags: '', rating: 0,
    requestedOn: new Date().toISOString().split('T')[0],
    arrivalStart: '', arrivalEnd: '', estimatedDuration: '1',
    assignedWorkerIds: [] as string[], notesForTechs: '',
    notes: '', validUntil: '', taxRate: 7,
    items: [{ description: '', quantity: 1, unitPrice: 0, total: 0, inventoryId: '' }] as (EstimateLineItem & { inventoryId?: string })[],
  };
  const [form, setForm] = useState(initialForm);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, statusFilter, prefs.pageSize]);
  const listQ = useQuery({
    queryKey: ['estimates', 'page', debounced, statusFilter, page, prefs.pageSize],
    queryFn: () => api.estimates.page({ search: debounced, status: statusFilter, page, pageSize: prefs.pageSize }),
  });
  const rows = (listQ.data?.items ?? []) as Estimate[];
  const total = listQ.data?.total ?? 0;
  const filtersOn = search || statusFilter !== 'all';
  const formDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  useUnsavedGuard(showCreate && formDirty);

  const onSelectCustomer = (id: string) => {
    const c = companyCustomers.find(x => x.id === id);
    if (!c) return;
    const parts = c.address.split(',').map(p => p.trim());
    const stateZip = (parts[2] || '').split(' ');
    setForm(f => ({
      ...f, customerId: c.id, customerName: c.name, customerEmail: c.email, customerPhone: c.phone,
      street: c.serviceLocation?.street ?? parts[0] ?? '',
      unit: c.serviceLocation?.unit ?? '',
      city: c.serviceLocation?.city ?? parts[1] ?? '',
      state: c.serviceLocation?.state ?? stateZip[0] ?? '',
      zip: c.serviceLocation?.zip ?? stateZip[1] ?? '',
      locationName: c.serviceLocation?.locationName ?? 'Home',
      gatedProperty: !!c.serviceLocation?.gatedProperty,
    }));
  };

  useEffect(() => {
    const cid = params.get('customerId');
    if (!cid || !companyCustomers.length) return;
    onSelectCustomer(cid);
    setShowCreate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, companyCustomers.length]);

  const updateLineItem = (index: number, field: keyof EstimateLineItem, value: string | number) => {
    const items = [...form.items];
    (items[index] as any)[field] = value;
    if (field === 'quantity' || field === 'unitPrice') items[index].total = items[index].quantity * items[index].unitPrice;
    setForm({ ...form, items });
  };

  const applyInventoryItem = (index: number, inventoryId: string) => {
    const items = [...form.items];
    if (inventoryId === '__custom__') {
      items[index] = { ...items[index], description: '', inventoryId: '__custom__', total: items[index].quantity * items[index].unitPrice };
      setForm({ ...form, items });
      return;
    }
    const inv = inventory.find((x) => x.id === inventoryId);
    if (!inv) return;
    const unitPrice = Number(inv.unitPrice) || 0;
    items[index] = {
      ...items[index],
      description: inv.name,
      unitPrice,
      inventoryId,
      total: items[index].quantity * unitPrice,
    };
    setForm({ ...form, items });
  };

  const addLineItem = () => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unitPrice: 0, total: 0, inventoryId: '' }] });
  const removeLineItem = (i: number) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const toggleWorker = (id: string) =>
    setForm(f => ({ ...f, assignedWorkerIds: f.assignedWorkerIds.includes(id) ? f.assignedWorkerIds.filter(x => x !== id) : [...f.assignedWorkerIds, id] }));

  const buildAddress = () =>
    [form.street + (form.unit ? ` ${form.unit}` : ''), form.city, `${form.state} ${form.zip}`.trim()].filter(s => s && s.trim()).join(', ');

  const handleCreate = async () => {
    const lineIssue = form.items.some((i) => i.description.trim() && (i.quantity <= 0 || i.unitPrice < 0));
    const errors: Record<string, string> = {
      customerId: form.customerId ? '' : 'Select an existing customer before creating an estimate.',
      items: form.items.every((i) => !i.description.trim()) ? 'Add at least one line item from inventory or a custom description.' : lineIssue ? 'Line quantity must be greater than 0 and price cannot be negative.' : '',
      dates: dateOrderError(form.requestedOn, form.validUntil, 'Valid until'),
      times: timeOrderError(form.arrivalStart, form.arrivalEnd),
      tax: taxRateError(form.taxRate),
    };
    setEstErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setCreating(true);
    try {
      await addEstimate({
        customerId: form.customerId,
        category: form.category,
        description: form.description,
        notes: form.notes,
        validUntil: form.validUntil,
        taxRate: form.taxRate,
        items: form.items
          .filter((i) => i.description.trim())
          .map(({ description, quantity, unitPrice, total }) => ({ description, quantity, unitPrice, total })),
        poNumber: form.poNumber,
        referralSource: form.referralSource,
        opportunityRating: form.rating,
        requestedOn: form.requestedOn,
        arrivalStart: form.arrivalStart,
        arrivalEnd: form.arrivalEnd,
        estimatedDuration: parseFloat(form.estimatedDuration) || 1,
        assignedWorkerIds: form.assignedWorkerIds,
        notesForTechs: form.notesForTechs,
      });
      toast.success('Estimate created!');
      setShowCreate(false);
      setForm(initialForm);
    } catch (err: any) {
      toast.error(err?.message || 'Could not create estimate');
    } finally {
      setCreating(false);
    }
  };

  const canEditEstimate = (est: Estimate) => est.status === 'draft' || est.status === 'sent';

  const closePdfPreview = () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const viewPdf = async (est: Estimate) => {
    setPdfBusy(est.id);
    try {
      const { blob, filename } = await api.estimates.pdf(est.id);
      closePdfPreview();
      setPdfPreview({ url: URL.createObjectURL(blob), name: filename || `${est.estimateNumber}.pdf` });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not open PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const downloadPdf = async (est: Estimate) => {
    setPdfBusy(est.id);
    try {
      const { blob, filename } = await api.estimates.pdf(est.id, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `${est.estimateNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not download PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const startEdit = async (est: Estimate) => {
    if (!canEditEstimate(est)) {
      toast.error('Only draft or sent estimates can be edited');
      return;
    }
    try {
      const full = await api.estimates.get(est.id) as Estimate;
      setEditing(full);
      setEditItems((full.items ?? []).map((i) => ({ ...i })));
      setEditValidUntil(full.validUntil || '');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not load estimate');
    }
  };

  const updateEditLine = (index: number, field: keyof EstimateLineItem, value: string | number) => {
    setEditItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value } as EstimateLineItem;
      if (field === 'quantity' || field === 'unitPrice') {
        row.total = Number(row.quantity) * Number(row.unitPrice);
      }
      next[index] = row;
      return next;
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const cleaned = editItems
      .map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
      }))
      .filter((i) => i.description);
    if (!cleaned.length || cleaned.some((i) => i.quantity <= 0 || i.unitPrice < 0)) {
      toast.error('Add at least one line item with quantity greater than 0');
      return;
    }
    setSavingEdit(true);
    try {
      await api.estimates.update(editing.id, {
        items: cleaned,
        validUntil: editValidUntil || undefined,
        taxRate: editing.taxRate,
      });
      await qc.invalidateQueries({ queryKey: ['estimates'] });
      setEditing(null);
      toast.success('Estimate updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update estimate');
    } finally {
      setSavingEdit(false);
    }
  };

  const stats = {
    total,
    pending: rows.filter(e => e.status === 'sent').length,
    approved: rows.filter(e => e.status === 'approved').length,
    value: rows.reduce((s, e) => s + e.total, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Estimates</h1>
          <p className="text-muted-foreground text-sm">{stats.total} total estimates</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gradient-primary text-primary-foreground gap-2">
          <Plus className="w-4 h-4" /> Create Estimate
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Estimates', value: stats.total, color: 'text-foreground' },
          { label: 'Pending', value: stats.pending, color: 'text-primary' },
          { label: 'Approved', value: stats.approved, color: 'text-success' },
          { label: 'Total Value', value: `$${stats.value.toLocaleString()}`, color: 'text-foreground' },
        ].map(s => (
          <Card key={s.label} className="shadow-theme-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search estimates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
            {filtersOn && (
              <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground shrink-0" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Clear
              </Button>
            )}
            <SavedViewsBar page="estimates" filters={{ search, status: statusFilter }} onApply={(f) => { setSearch(f.search || ''); setStatusFilter(f.status || 'all'); }} />
            <ColumnPicker columns={[{ id: 'customer', label: 'Customer' }, { id: 'category', label: 'Category' }, { id: 'status', label: 'Status' }, { id: 'total', label: 'Total' }, { id: 'valid', label: 'Valid until' }]} visible={prefs.visible} onToggle={prefs.setColumn} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Estimate #</TableHead>
                  {prefs.visible('customer') && <TableHead>Customer</TableHead>}
                  {prefs.visible('category') && <TableHead>Category</TableHead>}
                  {prefs.visible('status') && <TableHead>Status</TableHead>}
                  {prefs.visible('total') && <TableHead>Total</TableHead>}
                  {prefs.visible('valid') && <TableHead>Valid Until</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((est, i) => (
                  <motion.tr key={est.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/estimates/${est.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}><RecordMarks entityType="estimate" entityId={est.id} /></TableCell>
                    <TableCell className="font-medium text-sm">{est.estimateNumber}</TableCell>
                    {prefs.visible('customer') && (
                      <TableCell>
                        <div><p className="text-sm">{est.customerName}</p><p className="text-xs text-muted-foreground">{est.customerPhone}</p></div>
                      </TableCell>
                    )}
                    {prefs.visible('category') && <TableCell><Badge variant="secondary" className="text-xs">{est.category}</Badge></TableCell>}
                    {prefs.visible('status') && <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[est.status]}`}>{est.status}</span></TableCell>}
                    {prefs.visible('total') && <TableCell className="font-medium">${est.total.toFixed(2)}</TableCell>}
                    {prefs.visible('valid') && <TableCell className="text-sm text-muted-foreground">{est.validUntil || '—'}</TableCell>}
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View PDF" disabled={pdfBusy === est.id} onClick={() => void viewPdf(est)}>
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF" disabled={pdfBusy === est.id} onClick={() => void downloadPdf(est)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        {canEditEstimate(est) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit estimate" onClick={() => void startEdit(est)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Details" onClick={() => navigate(`/admin/estimates/${est.id}`)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setShowDelete(est)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                      {listQ.isLoading ? 'Loading…' : filtersOn ? 'No estimates match these filters.' : 'No estimates yet. Create one from a customer or this page.'}
                    </td>
                  </tr>
                )}
              </TableBody>
            </Table>
          </div>
          <ListPager page={page} pageSize={prefs.pageSize} total={total} onPage={setPage} onPageSize={prefs.setPageSize} />
        </CardContent>
      </Card>

      {/* Create Estimate Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open && confirmDiscard(formDirty)) { setShowCreate(false); setForm(initialForm); } else if (open) setShowCreate(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Create New Estimate</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Customer */}
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={form.customerId || undefined} onValueChange={onSelectCustomer}>
                <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                <SelectContent>
                  {companyCustomers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Customer Name</Label><Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Service Location */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">Service Location</Label>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <Input placeholder="Location Name (e.g. Home or Office)" value={form.locationName} onChange={e => setForm({ ...form, locationName: e.target.value })} />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap pb-2">
                  <Checkbox checked={form.gatedProperty} onCheckedChange={v => setForm({ ...form, gatedProperty: !!v })} />
                  Gated Property
                </label>
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Input placeholder="Street Address" value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} />
                <Input placeholder="Ste/Unit/Apt" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
                <Input placeholder="Zip" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2"><Label>Description</Label><Textarea rows={3} placeholder="Briefly describe the customer's needs..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>PO #</Label><Input value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} /></div>
              <div className="space-y-2"><Label>Requested On</Label><Input type="date" value={form.requestedOn} onChange={e => setForm({ ...form, requestedOn: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Referral Source</Label>
                <Select value={form.referralSource || 'none'} onValueChange={v => setForm({ ...form, referralSource: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="- No Source -" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">- No Source -</SelectItem>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Opportunity Rating</Label>
                <div className="flex items-center gap-1 h-10">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}>
                      <Star className={`w-5 h-5 ${form.rating >= n ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, Commercial" /></div>
              <div className="space-y-2"><Label>Valid Until</Label><Input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} /></div>
            </div>

            {/* On-site visit */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">On-Site Visit</Label>
              <div className="space-y-1">
                <Label className="text-xs">Arrival Time Window</Label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Input type="time" value={form.arrivalStart} onChange={e => setForm({ ...form, arrivalStart: e.target.value })} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" value={form.arrivalEnd} onChange={e => setForm({ ...form, arrivalEnd: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Estimated Duration (hours)</Label><Input type="number" step="0.5" value={form.estimatedDuration} onChange={e => setForm({ ...form, estimatedDuration: e.target.value })} /></div>
            </div>

            {/* Assigned techs */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">Assigned Techs</Label>
              <div className="border rounded-md p-2 space-y-1 max-h-32 overflow-y-auto">
                {companyWorkers.length === 0 && <p className="text-xs text-muted-foreground">No techs available</p>}
                {companyWorkers.map(w => (
                  <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                    <Checkbox checked={form.assignedWorkerIds.includes(w.id)} onCheckedChange={() => toggleWorker(w.id)} />
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{w.specialties.join(', ')}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1"><Label className="text-xs">Notes For Techs</Label><Textarea rows={2} value={form.notesForTechs} onChange={e => setForm({ ...form, notesForTechs: e.target.value })} /></div>
            </div>

            {/* Line items */}
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between"><Label>Line Items</Label><Button type="button" variant="outline" size="sm" onClick={addLineItem}><Plus className="w-3 h-3 mr-1" /> Add Item</Button></div>
              {inventory.length === 0 && (
                <p className="text-xs text-muted-foreground">No inventory items yet. Add stock on the Inventory page, or choose Custom line.</p>
              )}
              {form.items.map((item, idx) => (
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
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      />
                    )}
                  </div>
                  <div className="col-span-2"><Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2"><Input type="number" placeholder="Rate" value={item.unitPrice} onChange={e => updateLineItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2 text-sm font-medium text-right pt-2">${item.total.toFixed(2)}</div>
                  <div className="col-span-1">{form.items.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(idx)}><Trash2 className="w-3 h-3" /></Button>}</div>
                </div>
              ))}
              <div className="text-right text-sm space-y-1 border-t pt-2">
                <p>Subtotal: <span className="font-medium">${form.items.reduce((s, i) => s + i.total, 0).toFixed(2)}</span></p>
                <div className="flex items-center justify-end gap-2">
                  <span>Tax</span>
                  <Input type="number" className="w-16 h-7" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })} />
                  <span>%:</span>
                  <span className="font-medium">${(form.items.reduce((s, i) => s + i.total, 0) * form.taxRate / 100).toFixed(2)}</span>
                </div>
                <p className="text-base font-bold">Total: ${(form.items.reduce((s, i) => s + i.total, 0) * (1 + form.taxRate / 100)).toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2"><Label>Note To Customer</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <FieldError message={estErrors.customerId || estErrors.items || estErrors.dates || estErrors.times || estErrors.tax} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (confirmDiscard(formDirty)) { setShowCreate(false); setForm(initialForm); } }}>Cancel</Button>
            <Button onClick={handleCreate} className="gradient-primary text-primary-foreground" disabled={creating}>{creating ? 'Creating…' : 'Create Estimate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.estimateNumber}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Valid until</Label>
                <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
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
              <div className="text-sm text-right text-muted-foreground">Tax and total are recalculated when you save.</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={savingEdit} onClick={() => void saveEdit()}>{savingEdit ? 'Saving…' : 'Save estimate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pdfPreview} onOpenChange={(open) => { if (!open) closePdfPreview(); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.name || 'Estimate PDF'}</DialogTitle>
          </DialogHeader>
          {pdfPreview && (
            <iframe src={pdfPreview.url} title="Estimate PDF" className="w-full flex-1 min-h-[70vh] rounded border" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Estimate</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete "<strong>{showDelete?.estimateNumber}</strong>"?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { deleteEstimate(showDelete!.id); toast.success('Estimate deleted'); setShowDelete(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEstimates;
