import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ArrowUpDown, MapPin, Clock, User, Calendar, FileText as FileTextIcon, ExternalLink, PhoneCall, Archive, Upload } from 'lucide-react';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';
import { RecordMarks } from '@/components/crm/RecordMarks';
import { toast } from 'sonner';
import { JobStatus, JobPriority } from '@/store/types';
import CommunicationsThread from '@/components/communications/CommunicationsThread';
import { CopyContact } from '@/components/crm/CopyContact';
import { CrmBreadcrumb } from '@/components/crm/CrmBreadcrumb';
import { fileSizeError } from '@/lib/formValidation';

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

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    workers, updateJob, updateJobStatus, assignWorker,
    invoices, documents, estimates, currentUser, generateInvoiceFromJob, customers, addDocument,
  } = useFieldPro();
  const jobQ = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api.jobs.get(id!),
    enabled: !!id,
    retry: false,
  });
  const job = jobQ.data;
  const companyWorkers = workers.filter(w => w.companyId === currentUser?.companyId);
  const [newNote, setNewNote] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [description, setDescription] = useState('');
  const [notesForTechs, setNotesForTechs] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  useEffect(() => {
    if (!jobQ.data) return;
    const j = jobQ.data;
    track({ kind: 'job', id: j.id, label: j.title, href: `/admin/jobs/${j.id}` });
  }, [jobQ.data, track]);

  if (jobQ.isLoading) {
    return <p className="text-muted-foreground">Loading job…</p>;
  }

  if (jobQ.isError || !job) {
    const missing = jobQ.error instanceof ApiError && jobQ.error.status === 404;
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/admin/jobs')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <p className="text-muted-foreground">{missing || !job ? 'Job not found.' : 'Could not load job.'}</p>
      </div>
    );
  }

  const assignedWorkerIds = job.assignedWorkerIds && job.assignedWorkerIds.length > 0
    ? job.assignedWorkerIds
    : (job.assignedWorkerId ? [job.assignedWorkerId] : []);
  const assignedWorkers = companyWorkers.filter(w => assignedWorkerIds.includes(w.id));
  const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
  const jobDocuments = documents.filter(doc => doc.jobId === job.id);
  const sourceEstimate = job.estimateId ? estimates.find(e => e.id === job.estimateId) : null;

  const handleStatusChange = (status: JobStatus) => {
    updateJobStatus(job.id, status);
    toast.success(`Status updated to ${status.replace('_', ' ')}`);
  };

  const handleAssign = (workerId: string) => {
    const worker = companyWorkers.find(w => w.id === workerId);
    if (worker?.status === 'on_leave') { toast.error(`${worker.name} is on leave!`); return; }
    assignWorker(job.id, workerId);
    // also reflect in assignedWorkerIds
    const next = Array.from(new Set([...(job.assignedWorkerIds || []), workerId]));
    updateJob(job.id, { assignedWorkerIds: next });
    toast.success('Worker assigned!');
    setShowAssign(false);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    updateJob(job.id, { notes: [...job.notes, newNote] });
    setNewNote('');
    toast.success('Note added!');
  };

  const handleGenerateInvoice = async () => {
    if (!job.lineItems || job.lineItems.length === 0) {
      toast.error('No line items on this job. Add line items before generating an invoice.');
      return;
    }
    try {
      const invId = await generateInvoiceFromJob(job.id);
      if (invId) toast.success('Invoice generated! View it in Invoices.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate invoice');
    }
  };

  const startEditDetails = () => {
    setDescription(job.description || '');
    setNotesForTechs(job.notesForTechs || '');
    setScheduledDate(job.scheduledDate || '');
    setScheduledTime(job.scheduledTime || '');
    setEstimatedDuration(String(job.estimatedDuration ?? ''));
    setEditingDetails(true);
  };

  const cancelEditDetails = () => setEditingDetails(false);

  const handleSaveDetails = async () => {
    const duration = parseFloat(estimatedDuration);
    try {
      await updateJob(job.id, {
        description,
        notesForTechs,
        scheduledDate: scheduledDate.trim() || null,
        scheduledTime: scheduledTime.trim() || null,
        estimatedDuration: Number.isFinite(duration) ? duration : job.estimatedDuration,
      });
      toast.success('Job details updated');
      setEditingDetails(false);
      await qc.invalidateQueries({ queryKey: ['jobs', id] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not update job');
    }
  };

  const handleUploadImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    const sizeErr = fileSizeError(file);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }
    try {
      await addDocument(file, job.id);
      toast.success('Image uploaded');
      await qc.invalidateQueries({ queryKey: ['documents'] });
      await qc.invalidateQueries({ queryKey: ['jobs', id] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const lineItemSubtotal = (job.lineItems || []).reduce((s, i) => s + i.total, 0);
  const taxAmt = +(lineItemSubtotal * ((job.taxRate ?? 0) / 100)).toFixed(2);

  return (
    <div className="space-y-6">
      <CrmBreadcrumb items={[{ label: 'Jobs', href: '/admin/jobs' }, { label: job.title }]} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/jobs')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">{job.title}</h1>
            <div className="flex gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[job.status]}`}>{job.status.replace('_', ' ')}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[job.priority]}`}>{job.priority}</span>
              <Badge variant="secondary" className="text-xs">{job.category}</Badge>
              {job.poNumber && <Badge variant="outline" className="text-xs">PO# {job.poNumber}</Badge>}
              {job.archivedAt && <Badge variant="outline" className="text-xs text-destructive">Archived</Badge>}
              {sourceEstimate && (
                <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => navigate(`/admin/estimates/${sourceEstimate.id}`)}>
                  From {sourceEstimate.estimateNumber} <ExternalLink className="w-3 h-3 ml-1 inline" />
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <RecordMarks entityType="job" entityId={job.id} starred={job.starred} pinned={job.pinned} />
          {job.archivedAt ? (
            <Button variant="outline" className="gap-2" onClick={async () => {
              await api.jobs.restore(job.id);
              toast.success('Restored');
              qc.invalidateQueries({ queryKey: ['jobs'] });
            }}><Archive className="w-4 h-4" /> Restore</Button>
          ) : (
            <Button variant="outline" className="gap-2" onClick={async () => {
              await api.jobs.archive(job.id);
              toast.success('Archived');
              qc.invalidateQueries({ queryKey: ['jobs'] });
            }}><Archive className="w-4 h-4" /> Archive</Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setShowAssign(true)}><ArrowUpDown className="w-4 h-4" /> Assign Worker</Button>
          {job.status === 'completed' && (
            <Button className="gradient-primary text-primary-foreground gap-2" onClick={handleGenerateInvoice}>
              <FileTextIcon className="w-4 h-4" /> Generate Invoice
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lineitems">Line Items ({(job.lineItems || []).length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({job.notes.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({jobInvoices.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({jobDocuments.length})</TabsTrigger>
          <TabsTrigger value="comms" className="gap-1.5"><PhoneCall className="w-3.5 h-3.5" /> Comms</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-theme-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Job Description</CardTitle>
                  {editingDetails ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={cancelEditDetails}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveDetails}>Save</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={startEditDetails}>Edit</Button>
                  )}
                </CardHeader>
                <CardContent>
                  {editingDetails ? (
                    <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Job description" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{job.description || '—'}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-theme-sm">
                <CardHeader><CardTitle className="text-base">Customer Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <button onClick={() => navigate(`/admin/customers/${job.customerId}`)} className="text-sm font-medium text-primary hover:underline">
                      {job.customerName}
                    </button>
                  </div>
                  <CopyContact email={customers.find(c => c.id === job.customerId)?.email || job.primaryContact?.email} phone={job.customerPhone} />
                  <div className="flex items-center gap-3"><MapPin className="w-4 h-4 text-muted-foreground" /><p className="text-sm">{job.customerAddress}</p></div>
                  {job.serviceLocation?.gatedProperty && <Badge variant="outline" className="text-xs">Gated Property</Badge>}
                </CardContent>
              </Card>

              {(editingDetails || job.notesForTechs) && (
                <Card className="shadow-theme-sm border-warning/30">
                  <CardHeader><CardTitle className="text-base">Notes for Techs</CardTitle></CardHeader>
                  <CardContent>
                    {editingDetails ? (
                      <Textarea rows={3} value={notesForTechs} onChange={e => setNotesForTechs(e.target.value)} placeholder="Notes for technicians" />
                    ) : (
                      <p className="text-sm">{job.notesForTechs}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {job.materials.length > 0 && (
                <Card className="shadow-theme-sm">
                  <CardHeader><CardTitle className="text-base">Materials</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">{job.materials.map(m => <Badge key={m} variant="secondary">{m}</Badge>)}</div>
                  </CardContent>
                </Card>
              )}

              {job.tags && job.tags.length > 0 && (
                <Card className="shadow-theme-sm">
                  <CardHeader><CardTitle className="text-base">Tags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">{job.tags.map(t => <Badge key={t} variant="outline">{t}</Badge>)}</div>
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-theme-sm">
                <CardHeader><CardTitle className="text-base">Update Status</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(['new', 'assigned', 'in_progress', 'completed', 'cancelled'] as JobStatus[]).map(s => (
                      <Button key={s} size="sm" variant={job.status === s ? 'default' : 'outline'} onClick={() => handleStatusChange(s)} className="text-xs">
                        {s.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-theme-sm">
                <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {editingDetails ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Date</label>
                        <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Time</label>
                        <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Duration (hours)</label>
                        <Input type="number" min={0} step={0.5} value={estimatedDuration} onChange={e => setEstimatedDuration(e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><p>{job.scheduledDate || 'Not scheduled'}{job.endDate && job.multiDay ? ` → ${job.endDate}` : ''}</p></div>
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" />
                        <p>{job.scheduledTime || '—'}{job.arrivalEndTime ? ` – ${job.arrivalEndTime}` : ''} · {job.estimatedDuration}h</p>
                      </div>
                    </>
                  )}
                  {job.jobSource && <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{job.jobSource}</span></div>}
                  {job.billingType && <div><span className="text-muted-foreground">Billing:</span> <Badge variant="secondary" className="text-xs">{job.billingType.replace('_', ' ')}</Badge></div>}
                </CardContent>
              </Card>

              <Card className="shadow-theme-sm">
                <CardHeader><CardTitle className="text-base">Assigned Tech{assignedWorkers.length === 1 ? '' : 's'}</CardTitle></CardHeader>
                <CardContent>
                  {assignedWorkers.length > 0 ? (
                    <div className="space-y-3">
                      {assignedWorkers.map(w => (
                        <div key={w.id} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold">{w.name.charAt(0)}</div>
                          <div>
                            <p className="font-medium text-sm">{w.name}</p>
                            <p className="text-xs text-muted-foreground">{w.specialties.join(', ')}</p>
                            <p className="text-xs text-muted-foreground">★ {w.rating}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-2">No worker assigned</p>
                      <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>Assign Worker</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-theme-sm">
                <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{job.createdAt}</span>{job.createdByName ? ` by ${job.createdByName}` : ''}</div>
                  <div><span className="text-muted-foreground">Updated:</span> <span className="font-medium">{job.updatedAt}</span>{job.updatedByName ? ` by ${job.updatedByName}` : ''}</div>
                  <div><span className="text-muted-foreground">Owner:</span> <span className="font-medium">{job.ownerName || '—'}</span></div>
                  {job.archivedAt && <div><span className="text-muted-foreground">Archived:</span> <span className="font-medium">{new Date(job.archivedAt).toLocaleDateString()}</span>{job.archivedByName ? ` by ${job.archivedByName}` : ''}</div>}
                  {job.completedAt && <div><span className="text-muted-foreground">Completed:</span> <span className="font-medium">{job.completedAt}</span></div>}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="lineitems">
          <Card className="shadow-theme-sm">
            <CardContent className="p-6">
              {(!job.lineItems || job.lineItems.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-8">No line items on this job.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {job.lineItems.map(li => (
                        <TableRow key={li.id}>
                          <TableCell className="text-sm">{li.description}</TableCell>
                          <TableCell className="text-right text-sm">{li.quantity}</TableCell>
                          <TableCell className="text-right text-sm">${li.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">${li.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t mt-4 pt-4 space-y-1 text-right text-sm">
                    <p>Subtotal: <span className="font-medium">${lineItemSubtotal.toFixed(2)}</span></p>
                    <p>Tax ({job.taxRate ?? 0}%): <span className="font-medium">${taxAmt.toFixed(2)}</span></p>
                    <p className="text-lg font-bold">Total: ${(lineItemSubtotal + taxAmt).toFixed(2)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="shadow-theme-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Add a note..." value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
                <Button onClick={handleAddNote}>Add</Button>
              </div>
              {job.notes.length > 0 ? (
                <ul className="space-y-2">{job.notes.map((n, i) => <li key={i} className="text-sm bg-muted/50 rounded-lg p-3">{n}</li>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No notes yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="shadow-theme-sm">
            <CardContent className="p-6">
              {jobInvoices.length > 0 ? (
                <div className="space-y-3">
                  {jobInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50" onClick={() => navigate('/admin/invoices')}>
                      <div>
                        <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">{inv.createdAt} · Due {inv.dueDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${inv.total.toFixed(2)}</p>
                        <Badge variant="secondary" className="text-xs">{inv.status}</Badge>
                      </div>
                    </div>
                  ))}
                  {job.status === 'completed' && (
                    <Button onClick={handleGenerateInvoice} variant="outline" className="gap-2">
                      <FileTextIcon className="w-4 h-4" /> Generate another invoice
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">No invoices for this job.</p>
                  {job.status === 'completed' && (
                    <Button onClick={handleGenerateInvoice} className="gap-2"><FileTextIcon className="w-4 h-4" /> Generate Invoice</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card className="shadow-theme-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleUploadImage(e.target.files?.[0])}
                />
                <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Upload image
                </Button>
              </div>
              {jobDocuments.length > 0 ? (
                <div className="space-y-3">{jobDocuments.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.type} · {doc.size}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{doc.uploadedAt}</p>
                  </div>
                ))}</div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No documents for this job.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comms">
          <Card className="shadow-theme-sm">
            <CardContent className="p-6">
              <CommunicationsThread
                toNumber={job.customerPhone}
                filter={{ jobId: job.id }}
                title="Job Communications"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Worker Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Worker to: {job.title}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {companyWorkers.map(w => (
              <button key={w.id} onClick={() => handleAssign(w.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${w.status === 'on_leave' ? 'opacity-50' : ''} ${assignedWorkerIds.includes(w.id) ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">{w.name.charAt(0)}</div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.specialties.join(', ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">★ {w.rating}</span>
                  {w.status === 'on_leave' && <Badge variant="secondary" className="text-xs">On Leave</Badge>}
                  {assignedWorkerIds.includes(w.id) && <Badge className="text-xs">Assigned</Badge>}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobDetail;
