import { useState, type FormEvent } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Eye, Edit, Trash2, Star, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Worker } from '@/store/types';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { motion } from 'framer-motion';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, emailError, passwordMinError, phoneError, requiredText } from '@/lib/formValidation';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type WorkerStatus = 'active' | 'inactive' | 'on_leave';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  specialties: '',
  status: 'active' as WorkerStatus,
  password: '',
};

const AdminWorkers = () => {
  const {
    currentUser, workers, jobs,
    addWorker, updateWorker, deleteWorker,
    updateWorkerAvailability, addUnavailableDate, removeUnavailableDate,
  } = useFieldPro();
  const companyWorkers = workers.filter(w => !currentUser?.companyId || w.companyId === currentUser.companyId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [showDetail, setShowDetail] = useState<Worker | null>(null);
  const [showAvailability, setShowAvailability] = useState<Worker | null>(null);
  const [showDelete, setShowDelete] = useState<Worker | null>(null);
  const [leaveDate, setLeaveDate] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formDirty = JSON.stringify(form) !== JSON.stringify(editing ? {
    name: editing.name, email: editing.email, phone: editing.phone || '',
    specialties: (editing.specialties || []).join(', '), status: editing.status, password: '',
  } : emptyForm);
  useUnsavedGuard(showForm && formDirty);

  const filtered = companyWorkers
    .filter(w => statusFilter === 'all' || w.status === statusFilter)
    .filter(w => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (w.name || '').toLowerCase().includes(q)
        || (w.email || '').toLowerCase().includes(q)
        || (w.phone || '').includes(search)
        || (w.specialties || []).some(s => s.toLowerCase().includes(q));
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (w: Worker) => {
    setEditing(w);
    setForm({
      name: w.name,
      email: w.email,
      phone: w.phone || '',
      specialties: (w.specialties || []).join(', '),
      status: w.status,
      password: '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
  };

  const specialtiesList = () => form.specialties.split(',').map(s => s.trim()).filter(Boolean);

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    const next = applyErrors({
      name: requiredText(form.name, 'Name'),
      email: editing ? '' : emailError(form.email, { required: true }),
      phone: phoneError(form.phone),
      password: !editing && form.password.trim() ? passwordMinError(form.password) : '',
    });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      if (editing) {
        await updateWorker(editing.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          specialties: specialtiesList(),
          status: form.status,
        });
        toast.success(`${form.name} updated`);
      } else {
        const password = form.password.trim();
        await addWorker({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          specialties: specialtiesList(),
          status: form.status,
          password: password || undefined,
        });
        toast.success(`${form.name} added. They can sign in with ${form.email}${password ? '' : ' (temporary password: demo1234)'}`);
      }
      closeForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : editing ? 'Failed to update worker' : 'Failed to add worker');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    setSaving(true);
    try {
      await deleteWorker(showDelete.id);
      toast.success(`${showDelete.name} deactivated`);
      setShowDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove worker');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = async (worker: Worker, day: typeof DAYS[number]) => {
    const newAvail = { ...worker.availability };
    newAvail[day] = newAvail[day] ? null : { start: '08:00', end: '17:00' };
    try {
      await updateWorkerAvailability(worker.id, newAvail);
      setShowAvailability({ ...worker, availability: newAvail });
      toast.success(`${day} availability updated`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update availability');
    }
  };

  const updateTimeSlot = async (worker: Worker, day: typeof DAYS[number], field: 'start' | 'end', value: string) => {
    const newAvail = { ...worker.availability };
    if (!newAvail[day]) return;
    newAvail[day] = { ...newAvail[day]!, [field]: value };
    try {
      await updateWorkerAvailability(worker.id, newAvail);
      setShowAvailability({ ...worker, availability: newAvail });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update availability');
    }
  };

  const handleAddLeave = async (workerId: string) => {
    if (!leaveDate) return;
    try {
      await addUnavailableDate(workerId, leaveDate);
      toast.success('Leave date added');
      const w = workers.find(wr => wr.id === workerId);
      if (w) setShowAvailability({ ...w, unavailableDates: [...(w.unavailableDates || []), leaveDate] });
      setLeaveDate('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add leave');
    }
  };

  const workerJobs = (workerId: string) => jobs.filter(j => j.assignedWorkerId === workerId && (!currentUser?.companyId || j.companyId === currentUser.companyId));

  const statusClass = (status: string) =>
    status === 'active' ? 'tint-success'
      : status === 'on_leave' ? 'tint-warning'
        : 'tint-slate';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Worker Management</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} workers</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" /> Add Worker</Button>
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          <form className="flex gap-3 flex-wrap mb-4" autoComplete="off" onSubmit={e => e.preventDefault()}>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search workers..."
                className="pl-10"
                name="fp-worker-search"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={search}
                disabled={showForm}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On leave</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {(search || statusFilter !== 'all') && (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Clear filters
              </Button>
            )}
          </form>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Specialties</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Jobs Done</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w, i) => (
                  <motion.tr key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="cursor-pointer hover:bg-muted/50" onClick={() => setShowDetail(w)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">{(w.name || '?').charAt(0)}</div>
                        <div>
                          <p className="font-medium text-sm">{w.name}</p>
                          <p className="text-xs text-muted-foreground">{w.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">{(w.specialties || []).map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>
                    </TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(w.status)}`}>{w.status.replace('_', ' ')}</span></TableCell>
                    <TableCell><span className="flex items-center gap-1 text-sm"><Star className="w-3.5 h-3.5 text-warning fill-warning" /> {w.rating}</span></TableCell>
                    <TableCell className="text-sm">{w.jobsCompleted}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setShowDetail(w)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(w)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Availability" onClick={() => setShowAvailability(w)}><Calendar className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remove" onClick={() => setShowDelete(w)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No workers found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { if (confirmDiscard(formDirty)) closeForm(); } }}>
        <DialogContent>
          <form onSubmit={handleSave} autoComplete="on">
            <DialogHeader><DialogTitle>{editing ? 'Edit Worker' : 'Add Worker'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input autoComplete="name" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setFieldErrors(x => ({ ...x, name: '' })); }} {...fieldInvalidProps('name', fieldErrors.name)} />
                <FieldError id="name-error" message={fieldErrors.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={e => { setForm({ ...form, email: e.target.value }); setFieldErrors(x => ({ ...x, email: '' })); }}
                  disabled={!!editing}
                  {...fieldInvalidProps('email', fieldErrors.email)}
                />
                <FieldError id="email-error" message={fieldErrors.email} />
                {editing && <p className="text-xs text-muted-foreground">Email cannot be changed</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input type="tel" autoComplete="tel" value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setFieldErrors(x => ({ ...x, phone: '' })); }} {...fieldInvalidProps('phone', fieldErrors.phone)} />
                <FieldError id="phone-error" message={fieldErrors.phone} />
              </div>
              <div className="space-y-2">
                <Label>Specialties (comma separated)</Label>
                <Input autoComplete="off" name="specialties" value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} placeholder="Pipe repair, Water heater" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as WorkerStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_leave">On leave</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editing && (
                <div className="space-y-2">
                  <Label>Password (optional)</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    name="new-password"
                    value={form.password}
                    onChange={e => { setForm({ ...form, password: e.target.value }); setFieldErrors(x => ({ ...x, password: '' })); }}
                    placeholder="Leave blank for demo1234"
                    {...fieldInvalidProps('password', fieldErrors.password)}
                  />
                  <FieldError id="password-error" message={fieldErrors.password} />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters. If blank, the temporary password is demo1234.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { if (confirmDiscard(formDirty)) closeForm(); }}>Cancel</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={!form.name.trim() || saving}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Worker'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{showDetail?.name}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{showDetail.email}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{showDetail.phone || '—'}</p></div>
                <div><span className="text-muted-foreground">Status:</span><p className="font-medium capitalize">{showDetail.status.replace('_', ' ')}</p></div>
                <div><span className="text-muted-foreground">Rating:</span><p className="font-medium flex items-center gap-1"><Star className="w-4 h-4 text-warning fill-warning" /> {showDetail.rating}</p></div>
                <div><span className="text-muted-foreground">Jobs Completed:</span><p className="font-medium">{showDetail.jobsCompleted}</p></div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Specialties:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(showDetail.specialties || []).length
                    ? showDetail.specialties.map(s => <Badge key={s} variant="secondary">{s}</Badge>)
                    : <p className="text-sm text-muted-foreground">None</p>}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Current Jobs:</span>
                <div className="mt-1 space-y-1">
                  {workerJobs(showDetail.id).filter(j => !['completed', 'cancelled'].includes(j.status)).map(j => (
                    <div key={j.id} className="flex items-center justify-between p-2 rounded border text-sm">
                      <span>{j.title}</span>
                      <Badge variant="secondary" className="text-xs">{j.status.replace('_', ' ')}</Badge>
                    </div>
                  ))}
                  {workerJobs(showDetail.id).filter(j => !['completed', 'cancelled'].includes(j.status)).length === 0 && (
                    <p className="text-sm text-muted-foreground">No active jobs</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { setShowDetail(null); openEdit(showDetail); }} variant="outline" className="flex-1 gap-2"><Edit className="w-4 h-4" /> Edit</Button>
                <Button onClick={() => { setShowDetail(null); setShowAvailability(showDetail); }} variant="outline" className="flex-1 gap-2"><Calendar className="w-4 h-4" /> Availability</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showAvailability} onOpenChange={() => setShowAvailability(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Availability — {showAvailability?.name}</DialogTitle></DialogHeader>
          {showAvailability && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Weekly Schedule</h4>
                {DAYS.map(day => {
                  const slot = showAvailability.availability?.[day];
                  return (
                    <div key={day} className="flex items-center gap-3 p-2 rounded-lg border">
                      <Switch checked={!!slot} onCheckedChange={() => toggleDay(showAvailability, day)} />
                      <span className="text-sm font-medium capitalize w-24">{day}</span>
                      {slot ? (
                        <div className="flex items-center gap-2">
                          <Input type="time" value={slot.start} onChange={e => updateTimeSlot(showAvailability, day, 'start', e.target.value)} className="w-28 h-8 text-xs" />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input type="time" value={slot.end} onChange={e => updateTimeSlot(showAvailability, day, 'end', e.target.value)} className="w-28 h-8 text-xs" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Leave / Unavailable Dates</h4>
                <div className="flex gap-2">
                  <Input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} />
                  <Button size="sm" onClick={() => handleAddLeave(showAvailability.id)}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(showAvailability.unavailableDates || []).map(d => (
                    <Badge key={d} variant="secondary" className="text-xs gap-1">
                      {d}
                      <button onClick={async () => {
                        try {
                          await removeUnavailableDate(showAvailability.id, d);
                          setShowAvailability({ ...showAvailability, unavailableDates: showAvailability.unavailableDates.filter(x => x !== d) });
                          toast.success('Leave removed');
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : 'Failed to remove leave');
                        }
                      }} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  ))}
                  {(showAvailability.unavailableDates || []).length === 0 && <p className="text-xs text-muted-foreground">No leave dates set</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Worker</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deactivate <strong>{showDelete?.name}</strong>? They will be set to inactive and can be restored later by editing their status.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={saving} onClick={handleDelete}>{saving ? 'Removing...' : 'Remove'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWorkers;
