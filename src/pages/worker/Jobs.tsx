import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, MapPin, Phone, Play, CheckCircle, Camera, FileText, Search, ArrowLeft, Eye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { JobStatus } from '@/store/types';
import CommunicationsThread from '@/components/communications/CommunicationsThread';

const statusClass = (status: string) =>
  status === 'in_progress' ? 'tint-info'
    : status === 'completed' ? 'tint-success'
      : status === 'cancelled' ? 'tint-slate'
        : status === 'assigned' ? 'tint-indigo'
          : 'tint-slate';

export const WorkerJobs = () => {
  const { currentUser, jobs } = useFieldPro();
  const navigate = useNavigate();
  const myJobs = jobs.filter(j => (j.assignedWorkerId === currentUser?.id || j.assignedWorkerIds?.includes(currentUser?.id || '')) && !['cancelled'].includes(j.status));
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [search, setSearch] = useState('');
  const filtered = (tab === 'active' ? myJobs.filter(j => !['completed', 'cancelled'].includes(j.status)) : myJobs.filter(j => j.status === 'completed'))
    .filter(j => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return j.title.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q) || j.customerAddress?.toLowerCase().includes(q);
    });
  const activeCount = myJobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length;
  const completedCount = myJobs.filter(j => j.status === 'completed').length;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-bold">My Jobs</h1>
          <p className="hidden lg:block text-sm text-muted-foreground">{myJobs.length} assigned jobs</p>
        </div>
        <div className="hidden lg:block relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search jobs or customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <div className="flex bg-muted rounded-lg p-0.5 lg:w-fit">
        <Button variant={tab === 'active' ? 'default' : 'ghost'} size="sm" className="flex-1 lg:flex-none lg:px-4" onClick={() => setTab('active')}>Active ({activeCount})</Button>
        <Button variant={tab === 'completed' ? 'default' : 'ghost'} size="sm" className="flex-1 lg:flex-none lg:px-4" onClick={() => setTab('completed')}>Completed ({completedCount})</Button>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No {tab} jobs</CardContent></Card>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">{filtered.map(job => (
            <Card key={job.id} className="shadow-theme-sm cursor-pointer" onClick={() => navigate(`/worker/jobs/${job.id}`)}>
              <CardContent className="p-4">
                <div className="flex justify-between mb-2"><p className="font-medium text-sm">{job.title}</p>
                  <Badge className={`text-[10px] ${statusClass(job.status)}`}>{job.status.replace('_', ' ')}</Badge></div>
                <p className="text-xs text-muted-foreground mb-1">{job.customerName}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.scheduledDate} {job.scheduledTime}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.customerAddress?.split(',')[0]}</span>
                </div>
              </CardContent>
            </Card>
          ))}</div>

          <Card className="hidden lg:block shadow-theme-sm">
            <CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/worker/jobs/${job.id}`)}>
                      <TableCell>
                        <p className="font-medium text-sm">{job.title}</p>
                        {job.category && <p className="text-xs text-muted-foreground capitalize">{job.category}</p>}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{job.customerName}</p>
                        <p className="text-xs text-muted-foreground">{job.customerPhone}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{job.scheduledDate || '—'}<br />{job.scheduledTime || ''}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{job.customerAddress}</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(job.status)}`}>{job.status.replace('_', ' ')}</span></TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/worker/jobs/${job.id}`)}><Eye className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export const WorkerJobDetail = () => {
  const { id } = useParams();
  const { updateJobStatus, updateJob, currentUser } = useFieldPro();
  const qc = useQueryClient();
  const jobQ = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api.jobs.get(id!),
    enabled: !!id,
    retry: false,
  });
  const job = jobQ.data;
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  if (jobQ.isLoading) return <div className="text-center py-10 text-muted-foreground">Loading…</div>;
  if (jobQ.isError || !job) {
    const missing = jobQ.error instanceof ApiError && jobQ.error.status === 404;
    return <div className="text-center py-10 text-muted-foreground">{missing || !job ? 'Job not found' : 'Could not load job'}</div>;
  }

  const handlePhoto = async (file?: File) => {
    if (!file || !id) return;
    try {
      const uploaded = await api.files.upload(file);
      await api.jobs.addImage(id, uploaded.id);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Photo uploaded');
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    }
  };

  const handleStatus = (status: JobStatus) => {
    updateJobStatus(job.id, status);
    toast.success(`Job ${status === 'in_progress' ? 'started' : status === 'completed' ? 'completed' : 'updated'}!`);
  };

  const handleAddNote = () => {
    if (!note.trim()) return;
    updateJob(job.id, { notes: [...job.notes, `[${currentUser?.name}] ${note}`] });
    toast.success('Note added!');
    setShowNote(false);
    setNote('');
  };

  const actions = (
    <div className="space-y-2">
      {job.status === 'assigned' && <Button className="w-full gradient-primary text-primary-foreground gap-2" onClick={() => handleStatus('in_progress')}><Play className="w-4 h-4" /> Start Job</Button>}
      {job.status === 'in_progress' && <Button className="w-full bg-success text-success-foreground gap-2" onClick={() => handleStatus('completed')}><CheckCircle className="w-4 h-4" /> Complete Job</Button>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="gap-1" onClick={() => setShowNote(true)}><FileText className="w-4 h-4" /> Add Note</Button>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => handlePhoto(e.target.files?.[0])} />
        <Button variant="outline" className="gap-1" onClick={() => photoRef.current?.click()}><Camera className="w-4 h-4" /> Upload Photo</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-primary lg:hidden">← Back</button>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" className="hidden lg:inline-flex gap-2 shrink-0" onClick={() => navigate('/worker/jobs')}><ArrowLeft className="w-4 h-4" /> Back</Button>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3 lg:block">
              <h1 className="text-xl lg:text-2xl font-heading font-bold">{job.title}</h1>
              <Badge className={`lg:hidden shrink-0 ${statusClass(job.status)}`}>{job.status.replace('_', ' ')}</Badge>
            </div>
            <div className="hidden lg:flex gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(job.status)}`}>{job.status.replace('_', ' ')}</span>
              {job.priority && <Badge variant="secondary" className="text-xs capitalize">{job.priority}</Badge>}
              {job.category && <Badge variant="outline" className="text-xs capitalize">{job.category}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-theme-sm"><CardContent className="p-4 lg:p-5 space-y-3">
            <p className="hidden lg:block text-sm font-heading font-semibold mb-1">Customer</p>
            <div className="flex items-center gap-2"><span className="text-sm font-medium">{job.customerName}</span></div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="w-4 h-4" />{job.customerPhone}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="w-4 h-4" />{job.customerAddress}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4" />{job.scheduledDate} at {job.scheduledTime} · {job.estimatedDuration}h</div>
          </CardContent></Card>
          {job.materials.length > 0 && <Card className="shadow-theme-sm"><CardContent className="p-4 lg:p-5"><p className="text-sm font-medium mb-2">Materials</p><div className="flex flex-wrap gap-1">{job.materials.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}</div></CardContent></Card>}
          {job.notes.length > 0 && <Card className="shadow-theme-sm"><CardContent className="p-4 lg:p-5"><p className="text-sm font-medium mb-2">Notes</p>{job.notes.map((n, i) => <p key={i} className="text-sm bg-muted/50 rounded p-2 mb-1">{n}</p>)}</CardContent></Card>}
          <Card className="shadow-theme-sm"><CardContent className="p-4 lg:p-5">
            <CommunicationsThread toNumber={job.customerPhone} filter={{ jobId: job.id }} compact title="Customer Comms" />
          </CardContent></Card>
        </div>
        <div className="space-y-4">
          <div className="lg:rounded-xl lg:border lg:bg-card lg:shadow-theme-sm lg:p-5">
            <p className="hidden lg:block text-sm font-heading font-semibold mb-3">Actions</p>
            {actions}
          </div>
        </div>
      </div>
      <Dialog open={showNote} onOpenChange={setShowNote}><DialogContent><DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
        <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Enter your note..." rows={4} />
        <DialogFooter><Button variant="outline" onClick={() => setShowNote(false)}>Cancel</Button><Button onClick={handleAddNote}>Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};
