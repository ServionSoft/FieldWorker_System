import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Search, Mail, Phone, MapPin, DollarSign, Briefcase, Download, Upload, GitMerge, Edit, Trash2, Archive, Star, ListFilter } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '@/store/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ListPager } from '@/components/crm/ListPager';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { RecordMarks } from '@/components/crm/RecordMarks';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';
import { ColumnPicker } from '@/components/crm/ColumnPicker';
import { BulkActionBar } from '@/components/crm/BulkActionBar';
import { OwnerPicker } from '@/components/crm/OwnerPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, emailError, phoneError, requiredText } from '@/lib/formValidation';

const emptyForm = {
  firstName: '', lastName: '', email: '', phone: '', phoneExt: '',
  locationName: 'Home', street: '', unit: '', city: '', state: '', zip: '', gatedProperty: false,
  customerType: 'residential' as 'residential' | 'commercial',
  source: '', notes: '', tags: '', status: 'active' as 'active' | 'lead' | 'inactive',
  ownerUserId: '' as string,
};

const customerToForm = (c: Customer): typeof emptyForm => {
  const first = c.primaryContact?.firstName ?? (c.name || '').split(' ')[0] ?? '';
  const last = c.primaryContact?.lastName ?? (c.name || '').split(' ').slice(1).join(' ');
  const loc = c.serviceLocation;
  const addrParts = (c.address || '').split(',').map(p => p.trim());
  const stateZip = (addrParts[2] || '').split(' ');
  return {
    firstName: first,
    lastName: last,
    email: c.email || '',
    phone: c.phone || '',
    phoneExt: c.phoneExt || c.primaryContact?.phoneExt || '',
    locationName: loc?.locationName || 'Home',
    street: loc?.street || addrParts[0] || '',
    unit: loc?.unit || '',
    city: loc?.city || c.city || addrParts[1] || '',
    state: loc?.state || stateZip[0] || '',
    zip: loc?.zip || stateZip[1] || '',
    gatedProperty: !!loc?.gatedProperty,
    customerType: c.customerType === 'commercial' ? 'commercial' : 'residential',
    source: c.source || '',
    notes: c.notes || '',
    tags: (c.tags || []).join(', '),
    status: c.status,
    ownerUserId: c.ownerUserId || '',
  };
};

const CUSTOMER_COLS = [
  { id: 'contact', label: 'Contact' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Owner' },
  { id: 'tags', label: 'Tags' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'revenue', label: 'Revenue' },
];

const AdminCustomers = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useFieldPro();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const prefs = useTablePrefs('customers', { contact: true, status: true, owner: true, tags: true, jobs: true, revenue: true });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [archived, setArchived] = useState('active');
  const [starredOnly, setStarredOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showDelete, setShowDelete] = useState<Customer | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [keepId, setKeepId] = useState('');
  const [mergeId, setMergeId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<any[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); setSelected([]); }, [debounced, statusFilter, typeFilter, sourceFilter, cityFilter, archived, starredOnly, prefs.pageSize]);

  const listQ = useQuery({
    queryKey: ['customers', 'page', debounced, statusFilter, typeFilter, sourceFilter, cityFilter, archived, starredOnly, page, prefs.pageSize],
    queryFn: () => api.customers.page({
      search: debounced, status: statusFilter, type: typeFilter, source: sourceFilter,
      city: cityFilter, archived, starred: starredOnly || undefined, page, pageSize: prefs.pageSize,
    }),
  });
  const rows = (listQ.data?.items ?? []) as Customer[];
  const total = listQ.data?.total ?? 0;
  const sources = Array.from(new Set([
    ...customers.map(c => c.source).filter(Boolean) as string[],
    'Website', 'Google', 'Referral', 'Yelp', 'Facebook', 'Repeat Customer', 'Walk-in', 'Other',
  ]));
  const filtersOn = search || statusFilter !== 'all' || typeFilter !== 'all' || sourceFilter !== 'all' || cityFilter || archived !== 'active' || starredOnly;
  const baseline = editing ? customerToForm(editing) : emptyForm;
  const formDirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsavedGuard(showForm && formDirty);
  const allSelected = rows.length > 0 && rows.every((c) => selected.includes(c.id));

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['customers'] });
    setSelected([]);
  };

  useEffect(() => {
    if (!showForm) { setDupes([]); return; }
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!email && phone.replace(/\D/g, '').length < 7) { setDupes([]); return; }
    const t = setTimeout(async () => {
      try {
        const items = await api.customers.duplicates({ email, phone, excludeId: editing?.id });
        setDupes(items);
      } catch {
        setDupes([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.email, form.phone, showForm, editing?.id]);

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm(customerToForm(c));
    setFieldErrors({});
    setShowForm(true);
  };

  const formPayload = () => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    name: `${form.firstName} ${form.lastName}`.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    phoneExt: form.phoneExt,
    notes: form.notes,
    tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    status: form.status,
    customerType: form.customerType,
    source: form.source,
    locationName: form.locationName,
    street: form.street,
    unit: form.unit,
    city: form.city,
    state: form.state,
    zip: form.zip,
    gatedProperty: form.gatedProperty,
    ownerUserId: form.ownerUserId || null,
  });

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    const next = applyErrors({
      firstName: requiredText(form.firstName, 'First name'),
      phone: phoneError(form.phone, { required: true }),
      email: emailError(form.email),
    });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      const payload = formPayload();
      if (editing) {
        await updateCustomer(editing.id, payload);
        toast.success('Customer updated');
      } else {
        await addCustomer(payload);
        toast.success('Customer added successfully');
        setSearch('');
        setCityFilter('');
        refreshLists();
      }
      closeForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : editing ? 'Failed to update customer' : 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    setSaving(true);
    try {
      await deleteCustomer(showDelete.id);
      toast.success(`${showDelete.name} deleted`);
      setShowDelete(null);
      refreshLists();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete customer');
    } finally {
      setSaving(false);
    }
  };

  const statusColor = (s: string) => s === 'active' ? 'tint-success' : s === 'lead' ? 'tint-info' : 'tint-slate';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">{total} customers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setShowMerge(true)}><GitMerge className="w-4 h-4" /> Merge</Button>
          <Button variant="outline" className="gap-2" onClick={async () => {
            const items = await api.customers.exportAll();
            const headers = ['name','email','phone','address','status','customerType','source','tags','totalJobs','totalSpent'];
            const csv = [headers.join(','), ...items.map((c: any) => headers.map(h => `"${String(c[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'customers.csv'; a.click();
          }}><Download className="w-4 h-4" /> Export</Button>
          <label className="inline-flex">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (!file) return;
              const text = await file.text();
              const lines = text.split(/\r?\n/).filter(Boolean);
              if (lines.length < 2) { toast.error('CSV needs a header and rows'); return; }
              const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
              const idx = (n: string) => headers.indexOf(n);
              const rows = lines.slice(1).map(line => {
                const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
                const name = cols[idx('name')] || '';
                const [firstName, ...rest] = name.split(' ');
                return {
                  firstName: cols[idx('firstname')] || firstName || '',
                  lastName: cols[idx('lastname')] || rest.join(' '),
                  email: cols[idx('email')] || '',
                  phone: cols[idx('phone')] || '',
                  street: cols[idx('street')] || cols[idx('address')] || '',
                  city: cols[idx('city')] || '',
                  state: cols[idx('state')] || '',
                  zip: cols[idx('zip')] || '',
                  status: (['active','lead','inactive'].includes(cols[idx('status')]) ? cols[idx('status')] : 'active'),
                  customerType: cols[idx('customertype')] === 'commercial' ? 'commercial' : 'residential',
                  source: cols[idx('source')] || '',
                  tags: (cols[idx('tags')] || '').split(';').map(t => t.trim()).filter(Boolean),
                };
              });
              try {
                const r = await api.customers.importRows(rows);
                toast.success(`Imported ${r.created} customers`);
                window.location.reload();
              } catch (err: any) {
                toast.error(err?.message || 'Import failed');
              }
            }} />
            <Button variant="outline" className="gap-2" asChild><span><Upload className="w-4 h-4" /> Import</span></Button>
          </label>
          <Button onClick={openCreate} className="gradient-primary text-primary-foreground gap-2">
            <UserPlus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </div>

      <form className="flex items-center gap-2" autoComplete="off" onSubmit={e => e.preventDefault()}>
        <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              className="pl-9 h-9"
              name="fp-customer-search"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={search}
              disabled={showForm}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[130px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
            </SelectContent>
          </Select>
          {(() => {
            const extra = [typeFilter !== 'all', sourceFilter !== 'all', !!cityFilter, archived !== 'active', starredOnly].filter(Boolean).length;
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant={extra ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1.5 shrink-0">
                    <ListFilter className="w-3.5 h-3.5" />
                    More
                    {extra > 0 && <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]">{extra}</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-80 space-y-3"
                  onInteractOutside={(e) => {
                    const el = e.target as HTMLElement;
                    if (el.closest('[role="listbox"]')) e.preventDefault();
                  }}
                >
                  <p className="text-sm font-medium">More filters</p>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="residential">Residential</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Source</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input
                      placeholder="Filter by city"
                      className="h-9"
                      name="fp-customer-city-filter"
                      autoComplete="off"
                      value={cityFilter}
                      disabled={showForm}
                      onChange={e => setCityFilter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Records</Label>
                    <Select value={archived} onValueChange={setArchived}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                        <SelectItem value="all">All records</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant={starredOnly ? 'default' : 'outline'} size="sm" className="w-full gap-1.5" onClick={() => setStarredOnly((v) => !v)}>
                    <Star className="w-3.5 h-3.5" /> {starredOnly ? 'Showing starred' : 'Starred only'}
                  </Button>
                </PopoverContent>
              </Popover>
            );
          })()}
          {filtersOn && (
            <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground shrink-0" onClick={() => {
              setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setSourceFilter('all'); setCityFilter(''); setArchived('active'); setStarredOnly(false);
            }}>Clear</Button>
          )}
          <SavedViewsBar
            page="customers"
            filters={{ search, status: statusFilter, type: typeFilter, source: sourceFilter, city: cityFilter, archived, starred: starredOnly ? 'true' : '' }}
            onApply={(f) => {
              setSearch(f.search || '');
              setStatusFilter(f.status || 'all');
              setTypeFilter(f.type || 'all');
              setSourceFilter(f.source || 'all');
              setCityFilter(f.city || '');
              setArchived(f.archived || 'active');
              setStarredOnly(f.starred === 'true');
            }}
          />
          <ColumnPicker columns={CUSTOMER_COLS} visible={prefs.visible} onToggle={prefs.setColumn} />
      </form>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Matching', value: total, icon: UserPlus },
          { label: 'Revenue (page)', value: `$${rows.reduce((s, c) => s + (c.totalSpent || 0), 0).toLocaleString()}`, icon: DollarSign },
          { label: 'Jobs (page)', value: rows.reduce((s, c) => s + (c.totalJobs || 0), 0), icon: Briefcase },
        ].map(s => (
          <Card key={s.label} className="shadow-theme-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><s.icon className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-heading font-bold">{s.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <BulkActionBar
        count={selected.length}
        archivedMode={archived === 'archived'}
        statuses={[
          { value: 'lead', label: 'Lead' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        onArchive={async () => { await api.customers.bulk({ ids: selected, action: 'archive' }); toast.success('Archived'); refreshLists(); }}
        onRestore={async () => { await api.customers.bulk({ ids: selected, action: 'restore' }); toast.success('Restored'); refreshLists(); }}
        onStatus={async (status) => { await api.customers.bulk({ ids: selected, action: 'status', status }); toast.success('Status updated'); refreshLists(); }}
        onClear={() => setSelected([])}
        extra={
          <Button type="button" size="sm" variant="outline" onClick={() => {
            const items = rows.filter((c) => selected.includes(c.id));
            const headers = ['name','email','phone','address','status'];
            const csv = [headers.join(','), ...items.map((c) => headers.map((h) => `"${String((c as any)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'customers-selected.csv'; a.click();
          }}><Download className="w-3.5 h-3.5 mr-1" /> Export selected</Button>
        }
      />

      <Card className="shadow-theme-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? rows.map((c) => c.id) : [])} />
                </TableHead>
                <TableHead className="w-16"></TableHead>
                <TableHead>Customer</TableHead>
                {prefs.visible('contact') && <TableHead>Contact</TableHead>}
                {prefs.visible('status') && <TableHead>Status</TableHead>}
                {prefs.visible('owner') && <TableHead>Owner</TableHead>}
                {prefs.visible('tags') && <TableHead>Tags</TableHead>}
                {prefs.visible('jobs') && <TableHead className="text-right">Jobs</TableHead>}
                {prefs.visible('revenue') && <TableHead className="text-right">Revenue</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(c => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.includes(c.id)} onCheckedChange={(v) => setSelected((ids) => v ? [...ids, c.id] : ids.filter((id) => id !== c.id))} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <RecordMarks entityType="customer" entityId={c.id} starred={c.starred} pinned={c.pinned} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">{(c.name || '?').charAt(0)}</div>
                      <div>
                        <p className="font-medium text-sm">{c.name}{c.archivedAt ? ' (archived)' : ''}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{(c.address || '').split(',')[0] || '—'}</p>
                      </div>
                    </div>
                  </TableCell>
                  {prefs.visible('contact') && (
                    <TableCell>
                      <p className="text-sm flex items-center gap-1"><Mail className="w-3 h-3 text-muted-foreground" />{c.email}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>
                    </TableCell>
                  )}
                  {prefs.visible('status') && <TableCell><Badge variant="outline" className={statusColor(c.status)}>{c.status}</Badge></TableCell>}
                  {prefs.visible('owner') && <TableCell className="text-sm text-muted-foreground">{c.ownerName || '—'}</TableCell>}
                  {prefs.visible('tags') && (
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">{(c.tags || []).slice(0, 2).map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}{(c.tags || []).length > 2 && <Badge variant="secondary" className="text-xs">+{c.tags.length - 2}</Badge>}</div>
                    </TableCell>
                  )}
                  {prefs.visible('jobs') && <TableCell className="text-right font-medium">{c.totalJobs}</TableCell>}
                  {prefs.visible('revenue') && <TableCell className="text-right font-medium">${(c.totalSpent || 0).toLocaleString()}</TableCell>}
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(c)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      {c.archivedAt ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Restore" onClick={async () => { await api.customers.restore(c.id); toast.success('Restored'); refreshLists(); }}>
                          <Archive className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive" onClick={async () => { await api.customers.archive(c.id); toast.success('Archived'); refreshLists(); }}>
                          <Archive className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setShowDelete(c)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    {listQ.isLoading ? (
                      <p className="text-center py-12 text-sm text-muted-foreground">Loading…</p>
                    ) : filtersOn ? (
                      <EmptyState icon={Search} title="No matching customers" description="Try adjusting filters or search to find the records you need." />
                    ) : (
                      <EmptyState
                        icon={UserPlus}
                        title="No customers yet"
                        description="Create your first customer to start managing your customer relationships."
                        actionLabel="+ Add Customer"
                        onAction={openCreate}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <ListPager page={page} pageSize={prefs.pageSize} total={total} onPage={setPage} onPageSize={prefs.setPageSize} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { if (confirmDiscard(formDirty)) closeForm(); } }}>
        <DialogContent className="max-w-xl max-h-[90vh]">
          <form onSubmit={handleSave} autoComplete="on">
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'Add New Customer'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <div className="flex gap-2">
                {(['residential','commercial'] as const).map(t => (
                  <Button key={t} type="button" variant={form.customerType === t ? 'default' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, customerType: t }))}>{t.charAt(0).toUpperCase() + t.slice(1)}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as 'active' | 'lead' | 'inactive' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-semibold">Primary Contact</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName" className="text-xs">First Name <span className="text-destructive">*</span></Label>
                  <Input autoComplete="given-name" value={form.firstName} onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); setFieldErrors(x => ({ ...x, firstName: '' })); }} placeholder="John" {...fieldInvalidProps('firstName', fieldErrors.firstName)} />
                  <FieldError id="firstName-error" message={fieldErrors.firstName} />
                </div>
                <div><Label htmlFor="lastName" className="text-xs">Last Name</Label><Input autoComplete="family-name" name="lastName" id="lastName" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" /></div>
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div>
                  <Label htmlFor="phone" className="text-xs">Phone <span className="text-destructive">*</span></Label>
                  <Input autoComplete="tel" type="tel" value={form.phone} onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setFieldErrors(x => ({ ...x, phone: '' })); }} placeholder="(555) 123-4567" {...fieldInvalidProps('phone', fieldErrors.phone)} />
                  <FieldError id="phone-error" message={fieldErrors.phone} />
                </div>
                <div><Label htmlFor="phoneExt" className="text-xs">Ext</Label><Input autoComplete="off" name="phoneExt" id="phoneExt" value={form.phoneExt} onChange={e => setForm(f => ({ ...f, phoneExt: e.target.value }))} /></div>
              </div>
              <div>
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input autoComplete="email" type="email" value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setFieldErrors(x => ({ ...x, email: '' })); }} placeholder="john@email.com" {...fieldInvalidProps('email', fieldErrors.email)} />
                <FieldError id="email-error" message={fieldErrors.email} />
              </div>
              {dupes.length > 0 && (
                <Alert>
                  <AlertDescription className="text-sm">
                    Possible duplicate{dupes.length > 1 ? 's' : ''}:{' '}
                    {dupes.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 && ', '}
                        <button type="button" className="text-primary underline" onClick={() => { if (confirmDiscard(formDirty)) { closeForm(); navigate(`/admin/customers/${d.id}`); } }}>
                          {d.name}
                        </button>
                      </span>
                    ))}
                    . You can still save this record.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-semibold">Service Location</Label>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <Input placeholder="Location Name (e.g. Home or Office)" autoComplete="off" name="location-name" value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap pb-2">
                  <Checkbox checked={form.gatedProperty} onCheckedChange={v => setForm(f => ({ ...f, gatedProperty: !!v }))} />
                  Gated Property
                </label>
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Input placeholder="Street Address" autoComplete="address-line1" name="address-line1" value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
                <Input placeholder="Ste/Unit/Apt" autoComplete="address-line2" name="address-line2" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" autoComplete="address-level2" name="address-level2" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                <Input placeholder="State" autoComplete="address-level1" name="address-level1" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                <Input placeholder="Zip" autoComplete="postal-code" name="postal-code" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
              </div>
            </div>

            <div className="border-t pt-3 grid grid-cols-2 gap-4">
              <div>
                <Label>Source</Label>
                <Select value={form.source || 'none'} onValueChange={v => setForm(f => ({ ...f, source: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="- No Source -" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">- No Source -</SelectItem>
                    {['Website','Google','Referral','Yelp','Facebook','Repeat Customer','Walk-in','Other'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Tags (comma separated)</Label><Input autoComplete="off" name="customer-tags" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="VIP, Residential" /></div>
            </div>

            <div><Label>Notes</Label><Textarea autoComplete="off" name="customer-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Customer notes..." rows={3} /></div>
            <OwnerPicker value={form.ownerUserId} onChange={(id) => setForm(f => ({ ...f, ownerUserId: id || '' }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { if (confirmDiscard(formDirty)) closeForm(); }}>Cancel</Button>
            <Button type="submit" disabled={!form.firstName || !form.phone || saving} className="gradient-primary text-primary-foreground">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Customer'}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showMerge} onOpenChange={setShowMerge}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge customers</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Keep one record and move jobs, estimates, invoices, and contacts from the other onto it.</p>
          <div className="space-y-3">
            <div>
              <Label>Keep</Label>
              <Select value={keepId} onValueChange={setKeepId}>
                <SelectTrigger><SelectValue placeholder="Select customer to keep" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Merge into keep (will be deleted)</Label>
              <Select value={mergeId} onValueChange={setMergeId}>
                <SelectTrigger><SelectValue placeholder="Select duplicate" /></SelectTrigger>
                <SelectContent>{customers.filter(c => c.id !== keepId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMerge(false)}>Cancel</Button>
            <Button disabled={!keepId || !mergeId} onClick={async () => {
              try {
                await api.customers.merge(keepId, mergeId);
                toast.success('Customers merged');
                setShowMerge(false);
                navigate(`/admin/customers/${keepId}`);
                window.location.reload();
              } catch (err: any) {
                toast.error(err?.message || 'Merge failed');
              }
            }}>Merge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently delete <strong>{showDelete?.name}</strong>? This cannot be undone. Archive instead if you may need this record later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancel</Button>
            {showDelete && !showDelete.archivedAt && (
              <Button variant="outline" disabled={saving} onClick={async () => {
                await api.customers.archive(showDelete.id);
                toast.success('Archived');
                setShowDelete(null);
                refreshLists();
              }}>Archive</Button>
            )}
            <Button variant="destructive" disabled={saving} onClick={handleDelete}>{saving ? 'Deleting...' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCustomers;
