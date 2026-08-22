import { useState, useEffect, useMemo } from 'react';
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
import { Plus, Search, Eye, Trash2, X, CalendarDays, UserRound, Briefcase, MapPin, Archive, Star, ListFilter } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Job, JobStatus, JobPriority } from '@/store/types';
import { cn } from '@/lib/utils';
import { ListPager } from '@/components/crm/ListPager';
import { api } from '@/lib/api';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { RecordMarks } from '@/components/crm/RecordMarks';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';
import { ColumnPicker } from '@/components/crm/ColumnPicker';
import { BulkActionBar } from '@/components/crm/BulkActionBar';
import { OwnerPicker } from '@/components/crm/OwnerPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, dateOrderError, positiveNumberError, requiredText, timeOrderError } from '@/lib/formValidation';

const statusColors: Record<JobStatus, string> = {
  new: 'tint-slate',
  assigned: 'tint-indigo',
  in_progress: 'tint-info',
  completed: 'tint-success',
  cancelled: 'tint-slate',
};

const priorityColors: Record<JobPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'tint-indigo',
  high: 'tint-warning',
  urgent: 'tint-danger',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_LABELS: Record<JobPriority, string> = {
  low: 'Low',
  medium: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'general'] as const;
const SOURCES = ['Website', 'Google', 'Referral', 'Yelp', 'Facebook', 'Repeat Customer', 'Walk-in', 'Other'];

const emptyForm = {
  title: '', description: '', priority: 'medium' as JobPriority,
  customerId: '', customerName: '', customerPhone: '', customerEmail: '',
  locationName: '', street: '', unit: '', city: '', state: '', zip: '', gatedProperty: false,
  poNumber: '', jobSource: '', tags: '',
  scheduledDate: '', scheduledTime: '', arrivalEnd: '', multiDay: false, endDate: '',
  estimatedDuration: '2', category: 'plumbing' as const, materials: '',
  assignedWorkerIds: [] as string[], notifyTechs: true,
  notesForTechs: '', completionNotes: '', requiresFollowUp: false,
  billingType: 'single_invoice' as 'single_invoice' | 'progress_billing' | 'no_charge',
  ownerUserId: '' as string,
};

const JOB_COLS = [
  { id: 'customer', label: 'Customer' },
  { id: 'tech', label: 'Technician' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Owner' },
];

const jobWorkerIds = (job: Job) =>
  job.assignedWorkerIds?.length ? job.assignedWorkerIds : (job.assignedWorkerId ? [job.assignedWorkerId] : []);

const formatSchedule = (job: Job) => {
  if (!job.scheduledDate) return { primary: 'Unscheduled', secondary: '' };
  const primary = job.scheduledDate;
  const window = [job.scheduledTime, job.arrivalEndTime].filter(Boolean).join(' – ');
  return { primary, secondary: window };
};

const AdminJobs = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { currentUser, workers, customers, addJob, deleteJob } = useFieldPro();
  const prefs = useTablePrefs('jobs', { customer: true, tech: true, schedule: true, priority: true, status: true, owner: true });
  const companyWorkers = workers.filter(w => !currentUser?.companyId || w.companyId === currentUser.companyId);
  const companyCustomers = customers.filter(c => !currentUser?.companyId || c.companyId === currentUser.companyId);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('upcoming');
  const [archived, setArchived] = useState('active');
  const [starredOnly, setStarredOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); setSelected([]); }, [debounced, statusFilter, priorityFilter, workerFilter, categoryFilter, sourceFilter, dateFrom, dateTo, sortBy, archived, starredOnly, prefs.pageSize]);

  const listQ = useQuery({
    queryKey: ['jobs', 'page', debounced, statusFilter, priorityFilter, workerFilter, categoryFilter, sourceFilter, dateFrom, dateTo, sortBy, archived, starredOnly, page, prefs.pageSize],
    queryFn: () => api.jobs.page({
      search: debounced,
      status: statusFilter,
      priority: priorityFilter,
      category: categoryFilter,
      source: sourceFilter,
      workerId: workerFilter,
      dateFrom, dateTo, sort: sortBy, archived,
      starred: starredOnly || undefined,
      page, pageSize: prefs.pageSize,
    }),
  });
  const rows = (listQ.data?.items ?? []) as Job[];
  const total = listQ.data?.total ?? 0;
  const counts = listQ.data?.counts ?? { all: total, new: 0, assigned: 0, in_progress: 0, completed: 0, cancelled: 0, unassigned: 0 };
  const formDirty = JSON.stringify(form) !== JSON.stringify(emptyForm);
  useUnsavedGuard(showCreate && formDirty);
  const allSelected = rows.length > 0 && rows.every((j) => selected.includes(j.id));
  const refreshLists = () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setSelected([]); };

  const workerName = (id: string) => companyWorkers.find(w => w.id === id)?.name || 'Unknown';

  const sources = useMemo(
    () => Array.from(new Set([...SOURCES, ...rows.map(j => j.jobSource).filter(Boolean)])) as string[],
    [rows],
  );

  const activeChips = [
    statusFilter !== 'all' && { key: 'status', label: statusFilter === 'unassigned' ? 'Unassigned' : STATUS_LABELS[statusFilter as JobStatus], clear: () => setStatusFilter('all') },
    priorityFilter !== 'all' && { key: 'priority', label: `Priority: ${PRIORITY_LABELS[priorityFilter as JobPriority]}`, clear: () => setPriorityFilter('all') },
    workerFilter !== 'all' && { key: 'worker', label: workerFilter === 'unassigned' ? 'No technician' : workerName(workerFilter), clear: () => setWorkerFilter('all') },
    categoryFilter !== 'all' && { key: 'category', label: categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1), clear: () => setCategoryFilter('all') },
    sourceFilter !== 'all' && { key: 'source', label: `Source: ${sourceFilter}`, clear: () => setSourceFilter('all') },
    dateFrom && { key: 'from', label: `From ${dateFrom}`, clear: () => setDateFrom('') },
    dateTo && { key: 'to', label: `To ${dateTo}`, clear: () => setDateTo('') },
    search.trim() && { key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') },
    archived !== 'active' && { key: 'archived', label: archived === 'archived' ? 'Archived' : 'All records', clear: () => setArchived('active') },
    starredOnly && { key: 'starred', label: 'Starred', clear: () => setStarredOnly(false) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setWorkerFilter('all');
    setCategoryFilter('all');
    setSourceFilter('all');
    setDateFrom('');
    setDateTo('');
    setArchived('active');
    setStarredOnly(false);
  };

  const onSelectCustomer = (id: string) => {
    const c = companyCustomers.find(x => x.id === id);
    if (!c) return;
    const parts = (c.address || '').split(',').map(p => p.trim());
    const stateZip = (parts[2] || '').split(' ');
    setForm(f => ({
      ...f,
      customerId: c.id, customerName: c.name, customerPhone: c.phone, customerEmail: c.email,
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

  const handleCreate = async () => {
    const next = applyErrors({
      customerId: form.customerId ? '' : 'Select an existing customer before creating a job.',
      title: requiredText(form.title, 'Title'),
      arrivalEnd: timeOrderError(form.scheduledTime, form.arrivalEnd),
      endDate: form.multiDay ? (requiredText(form.endDate, 'End date') || dateOrderError(form.scheduledDate, form.endDate)) : '',
      estimatedDuration: positiveNumberError(form.estimatedDuration, 'Duration'),
    });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const leaveAssigned = form.assignedWorkerIds.filter((id) => companyWorkers.find((w) => w.id === id)?.status === 'on_leave');
    if (leaveAssigned.length) {
      toast.error('Workers on leave cannot be assigned to a job.');
      return;
    }
    setSaving(true);
    try {
      await addJob({
        title: form.title, description: form.description, priority: form.priority,
        customerId: form.customerId, assignedWorkerIds: form.assignedWorkerIds,
        scheduledDate: form.scheduledDate, scheduledTime: form.scheduledTime,
        arrivalEndTime: form.arrivalEnd, multiDay: form.multiDay, endDate: form.endDate,
        estimatedDuration: parseFloat(form.estimatedDuration) || 1,
        materials: form.materials.split(',').map(s => s.trim()).filter(Boolean),
        category: form.category,
        poNumber: form.poNumber, jobSource: form.jobSource,
        notesForTechs: form.notesForTechs, completionNotes: form.completionNotes,
        requiresFollowUp: form.requiresFollowUp, notifyTechs: form.notifyTechs,
        ownerUserId: form.ownerUserId || undefined,
      });
      toast.success('Job created successfully');
      setShowCreate(false);
      setForm(emptyForm);
      setFieldErrors({});
      refreshLists();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not create job');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    setSaving(true);
    try {
      await deleteJob(showDelete.id);
      toast.success('Job deleted');
      setShowDelete(null);
      refreshLists();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not delete job');
    } finally {
      setSaving(false);
    }
  };

  const toggleWorker = (id: string) => {
    const worker = companyWorkers.find((w) => w.id === id);
    if (worker?.status === 'on_leave') {
      toast.error('This worker is on leave and cannot be assigned.');
      return;
    }
    setForm(f => ({ ...f, assignedWorkerIds: f.assignedWorkerIds.includes(id) ? f.assignedWorkerIds.filter(x => x !== id) : [...f.assignedWorkerIds, id] }));
  };

  const pipeline = [
    { key: 'all', label: 'All jobs', value: counts.all },
    { key: 'new', label: 'New', value: counts.new },
    { key: 'assigned', label: 'Assigned', value: counts.assigned },
    { key: 'in_progress', label: 'In progress', value: counts.in_progress },
    { key: 'completed', label: 'Completed', value: counts.completed },
    { key: 'unassigned', label: 'Unassigned', value: counts.unassigned },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Jobs</h1>
          <p className="text-muted-foreground text-sm">
            {total} jobs
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setShowCreate(true); }} className="gradient-primary text-primary-foreground gap-2">
          <Plus className="w-4 h-4" /> Create Job
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {pipeline.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatusFilter(item.key)}
            className={cn(
              'rounded-lg border bg-card text-left p-4 shadow-theme-sm transition-colors',
              statusFilter === item.key ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/40',
            )}
          >
            <p className="text-2xl font-heading font-bold tabular-nums">{item.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          </button>
        ))}
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4 space-y-4">
          <form className="space-y-3" autoComplete="off" onSubmit={e => e.preventDefault()}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs…"
                  className="pl-10 h-9"
                  name="fp-job-search"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  value={search}
                  disabled={showCreate}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <SavedViewsBar
                page="jobs"
                filters={{ search, status: statusFilter, priority: priorityFilter, worker: workerFilter, category: categoryFilter, source: sourceFilter, dateFrom, dateTo, sort: sortBy, archived, starred: starredOnly ? 'true' : '' }}
                onApply={(f) => {
                  setSearch(f.search || '');
                  setStatusFilter(f.status || 'all');
                  setPriorityFilter(f.priority || 'all');
                  setWorkerFilter(f.worker || 'all');
                  setCategoryFilter(f.category || 'all');
                  setSourceFilter(f.source || 'all');
                  setDateFrom(f.dateFrom || '');
                  setDateTo(f.dateTo || '');
                  setSortBy(f.sort || 'upcoming');
                  setArchived(f.archived || 'active');
                  setStarredOnly(f.starred === 'true');
                }}
              />
              <ColumnPicker columns={JOB_COLS} visible={prefs.visible} onToggle={prefs.setColumn} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={workerFilter} onValueChange={setWorkerFilter}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Technician" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All technicians</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {companyWorkers.filter(w => w.status === 'active').map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming first</SelectItem>
                  <SelectItem value="newest">Newest created</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="customer">Customer A–Z</SelectItem>
                </SelectContent>
              </Select>
              {(() => {
                const extra = [categoryFilter !== 'all', sourceFilter !== 'all', !!dateFrom, !!dateTo, archived !== 'active', starredOnly].filter(Boolean).length;
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant={extra ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1.5">
                        <ListFilter className="w-3.5 h-3.5" />
                        More
                        {extra > 0 && <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]">{extra}</Badge>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-80 space-y-3"
                      onInteractOutside={(e) => {
                        const el = e.target as HTMLElement;
                        if (el.closest('[role="listbox"]')) e.preventDefault();
                      }}
                    >
                      <p className="text-sm font-medium">More filters</p>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Category</Label>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {CATEGORIES.map(c => (
                              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Source</Label>
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All sources</SelectItem>
                            {(sources.length ? sources : SOURCES).map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Scheduled from</Label>
                          <Input type="date" className="h-9" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Scheduled to</Label>
                          <Input type="date" className="h-9" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                        </div>
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
              {activeChips.length > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </form>

          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeChips.map(chip => (
                <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
                  {chip.label}
                  <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={chip.clear} aria-label={`Remove ${chip.label}`}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <BulkActionBar
            count={selected.length}
            archivedMode={archived === 'archived'}
            statuses={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            onArchive={async () => { await api.jobs.bulk({ ids: selected, action: 'archive' }); toast.success('Archived'); refreshLists(); }}
            onRestore={async () => { await api.jobs.bulk({ ids: selected, action: 'restore' }); toast.success('Restored'); refreshLists(); }}
            onStatus={async (status) => { await api.jobs.bulk({ ids: selected, action: 'status', status }); toast.success('Status updated'); refreshLists(); }}
            onClear={() => setSelected([])}
          />

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? rows.map((j) => j.id) : [])} /></TableHead>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Job</TableHead>
                  {prefs.visible('customer') && <TableHead>Customer</TableHead>}
                  {prefs.visible('tech') && <TableHead>Technician</TableHead>}
                  {prefs.visible('schedule') && <TableHead>Schedule</TableHead>}
                  {prefs.visible('priority') && <TableHead>Priority</TableHead>}
                  {prefs.visible('status') && <TableHead>Status</TableHead>}
                  {prefs.visible('owner') && <TableHead>Owner</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(job => {
                  const ids = jobWorkerIds(job);
                  const schedule = formatSchedule(job);
                  return (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/admin/jobs/${job.id}`)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.includes(job.id)} onCheckedChange={(v) => setSelected((cur) => v ? [...cur, job.id] : cur.filter((id) => id !== job.id))} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RecordMarks entityType="job" entityId={job.id} starred={job.starred} pinned={job.pinned} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2 min-w-[180px]">
                          <Briefcase className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{job.title}{job.archivedAt ? ' (archived)' : ''}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {job.category}{job.poNumber ? ` · PO ${job.poNumber}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      {prefs.visible('customer') && (
                        <TableCell>
                          <div className="min-w-[160px]">
                            <p className="text-sm">{job.customerName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              {job.customerPhone || job.customerAddress ? (
                                <>
                                  {job.customerAddress && <MapPin className="w-3 h-3 shrink-0" />}
                                  <span className="truncate max-w-[200px]">{job.customerAddress?.split(',')[0] || job.customerPhone}</span>
                                </>
                              ) : '—'}
                            </p>
                          </div>
                        </TableCell>
                      )}
                      {prefs.visible('tech') && (
                        <TableCell>
                          {ids.length ? (
                            <div className="flex flex-wrap gap-1">
                              {ids.slice(0, 2).map(id => (
                                <Badge key={id} variant="secondary" className="text-xs font-normal gap-1">
                                  <UserRound className="w-3 h-3" />{workerName(id)}
                                </Badge>
                              ))}
                              {ids.length > 2 && <Badge variant="secondary" className="text-xs font-normal">+{ids.length - 2}</Badge>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                      )}
                      {prefs.visible('schedule') && (
                        <TableCell>
                          <div className="flex items-start gap-1.5 text-sm">
                            <CalendarDays className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p>{schedule.primary}</p>
                              {schedule.secondary && <p className="text-xs text-muted-foreground">{schedule.secondary}</p>}
                            </div>
                          </div>
                        </TableCell>
                      )}
                      {prefs.visible('priority') && (
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[job.priority]}`}>
                            {PRIORITY_LABELS[job.priority]}
                          </span>
                        </TableCell>
                      )}
                      {prefs.visible('status') && (
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[job.status]}`}>
                            {STATUS_LABELS[job.status]}
                          </span>
                        </TableCell>
                      )}
                      {prefs.visible('owner') && <TableCell className="text-sm text-muted-foreground">{job.ownerName || '—'}</TableCell>}
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => navigate(`/admin/jobs/${job.id}`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {job.archivedAt ? (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Restore" onClick={async () => { await api.jobs.restore(job.id); toast.success('Restored'); refreshLists(); }}>
                              <Archive className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive" onClick={async () => { await api.jobs.archive(job.id); toast.success('Archived'); refreshLists(); }}>
                              <Archive className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setShowDelete(job)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      {listQ.isLoading ? (
                        <p className="text-center py-16 text-sm text-muted-foreground">Loading…</p>
                      ) : activeChips.length > 0 ? (
                        <EmptyState
                          icon={Search}
                          title="No matching jobs"
                          description="Try clearing filters to see all jobs in this workspace."
                          actionLabel="Clear filters"
                          actionVariant="outline"
                          onAction={clearFilters}
                        />
                      ) : (
                        <EmptyState
                          icon={Briefcase}
                          title="No jobs yet"
                          description="Create your first job to start tracking work for your customers."
                          actionLabel="+ Add Job"
                          onAction={() => { setForm(emptyForm); setShowCreate(true); }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <ListPager page={page} pageSize={prefs.pageSize} total={total} onPage={setPage} onPageSize={prefs.setPageSize} />
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open && confirmDiscard(formDirty)) { setShowCreate(false); setForm(emptyForm); } else if (open) setShowCreate(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setFieldErrors(x => ({ ...x, title: '' })); }} placeholder="e.g. Water Heater Replacement" {...fieldInvalidProps('title', fieldErrors.title)} />
              <FieldError id="title-error" message={fieldErrors.title} />
            </div>
            <div className="space-y-2"><Label>Job Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe your service needs" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Job Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as typeof form.category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as JobPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={form.customerId || undefined} onValueChange={(id) => { setFieldErrors(x => ({ ...x, customerId: '' })); onSelectCustomer(id); }}>
                <SelectTrigger aria-invalid={Boolean(fieldErrors.customerId) || undefined}><SelectValue placeholder="Select a customer" /></SelectTrigger>
                <SelectContent>
                  {companyCustomers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.customerId} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Customer Name</Label><Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} /></div>
              <div className="space-y-2"><Label>PO #</Label><Input value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} /></div>
            </div>

            <div className="space-y-2 border-t pt-3">
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

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Scheduling</Label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.multiDay} onCheckedChange={v => setForm({ ...form, multiDay: !!v })} />
                  Multi-day job
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} /></div>
                {form.multiDay && (
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Input type="date" value={form.endDate} onChange={e => { setForm({ ...form, endDate: e.target.value }); setFieldErrors(x => ({ ...x, endDate: '' })); }} />
                    <FieldError message={fieldErrors.endDate} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Arrival Time Window</Label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" value={form.arrivalEnd} onChange={e => { setForm({ ...form, arrivalEnd: e.target.value }); setFieldErrors(x => ({ ...x, arrivalEnd: '' })); }} />
                </div>
                <FieldError message={fieldErrors.arrivalEnd} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estimated Duration (hours)</Label>
                <Input type="number" step="0.5" min="0.5" value={form.estimatedDuration} onChange={e => { setForm({ ...form, estimatedDuration: e.target.value }); setFieldErrors(x => ({ ...x, estimatedDuration: '' })); }} />
                <FieldError message={fieldErrors.estimatedDuration} />
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">Assigned Techs</Label>
              <div className="border rounded-md p-2 space-y-1 max-h-32 overflow-y-auto">
                {companyWorkers.filter(w => w.status === 'active').length === 0 && <p className="text-xs text-muted-foreground">No techs available</p>}
                {companyWorkers.filter(w => w.status === 'active').map(w => (
                  <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                    <Checkbox checked={form.assignedWorkerIds.includes(w.id)} onCheckedChange={() => toggleWorker(w.id)} />
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{(w.specialties || []).join(', ')}</span>
                  </label>
                ))}
                {companyWorkers.some(w => w.status === 'on_leave') && (
                  <p className="text-xs text-muted-foreground">Workers on leave are hidden and cannot be assigned.</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={form.notifyTechs} onCheckedChange={v => setForm({ ...form, notifyTechs: !!v })} />
                Notify all tech(s) assigned
              </label>
              <div className="space-y-1"><Label className="text-xs">Notes For Techs</Label><Textarea rows={2} value={form.notesForTechs} onChange={e => setForm({ ...form, notesForTechs: e.target.value })} /></div>
            </div>

            <div className="border-t pt-3 grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label className="text-xs">Job Source</Label>
                <Select value={form.jobSource || 'none'} onValueChange={v => setForm({ ...form, jobSource: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="- No Source -" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">- No Source -</SelectItem>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Tags (comma-separated)</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, Emergency" /></div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Billing</Label>
                <div className="flex gap-2">
                  {([
                    { v: 'single_invoice', l: 'Single Invoice' },
                    { v: 'progress_billing', l: 'Progress Billing' },
                    { v: 'no_charge', l: 'No Charge' },
                  ] as const).map(opt => (
                    <Button key={opt.v} type="button" variant={form.billingType === opt.v ? 'default' : 'outline'} size="sm" onClick={() => setForm({ ...form, billingType: opt.v })}>{opt.l}</Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2"><Label>Materials (comma separated)</Label><Input value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })} placeholder="Pipe, Fittings, Sealant" /></div>
            <div className="space-y-2"><Label>Completion Notes</Label><Textarea rows={2} value={form.completionNotes} onChange={e => setForm({ ...form, completionNotes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.requiresFollowUp} onCheckedChange={v => setForm({ ...form, requiresFollowUp: !!v })} />
              Requires Follow-up
            </label>
            <OwnerPicker value={form.ownerUserId} onChange={(id) => setForm({ ...form, ownerUserId: id || '' })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (confirmDiscard(formDirty)) { setShowCreate(false); setForm(emptyForm); } }}>Cancel</Button>
            <Button onClick={handleCreate} className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? 'Creating…' : 'Create Job'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Job</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Permanently delete "<strong>{showDelete?.title}</strong>"? Archive if you may need it later.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancel</Button>
            {showDelete && !showDelete.archivedAt && (
              <Button variant="outline" disabled={saving} onClick={async () => {
                await api.jobs.archive(showDelete.id);
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

export default AdminJobs;
