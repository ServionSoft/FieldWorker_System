import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, Mail, MapPin, Edit, Trash2, DollarSign, Briefcase, FileText,
  Calculator, PhoneCall, StickyNote, Plus, CheckCircle, Users, Home, Activity, Star, Archive, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import CommunicationsThread from '@/components/communications/CommunicationsThread';
import { CopyContact } from '@/components/crm/CopyContact';
import { CrmBreadcrumb } from '@/components/crm/CrmBreadcrumb';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';
import { RecordMarks } from '@/components/crm/RecordMarks';
import { OwnerPicker } from '@/components/crm/OwnerPicker';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { emailError, phoneError, requiredText } from '@/lib/formValidation';

const CustomerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { jobs, invoices, documents, serviceAgreements, estimates, updateCustomer, deleteCustomer, generateInvoiceFromJob, emailTemplates, workers, currentUser } = useFieldPro();
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  const customerQ = useQuery({
    queryKey: ['customers', id],
    queryFn: () => api.customers.get(id!),
    enabled: !!id,
    retry: false,
  });
  const notesQ = useQuery({ queryKey: ['customers', id, 'notes'], queryFn: () => api.customers.notes(id!), enabled: !!id });
  const activityQ = useQuery({ queryKey: ['customers', id, 'activity'], queryFn: () => api.customers.activity(id!), enabled: !!id });
  const followQ = useQuery({
    queryKey: ['follow-ups', id],
    queryFn: () => api.followUps.list({ customerId: id! }),
    enabled: !!id,
  });

  const customer = customerQ.data;
  const customerJobs = jobs.filter(j => j.customerId === id);
  const customerEstimates = estimates.filter(e => e.customerId === id);
  const customerInvoices = invoices.filter(i => i.customerId === id || customerJobs.some(j => j.id === i.jobId));
  const customerDocs = documents.filter(d => customerJobs.some(j => j.id === d.jobId));
  const customerAgreements = serviceAgreements.filter(sa => sa.customerId === id || sa.customerName === customer?.name);
  const liveRevenue = customerInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + i.total, 0);
  const billableJobs = customerJobs.filter(j => (j.lineItems?.length ?? 0) > 0 && j.status !== 'cancelled');

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showFollow, setShowFollow] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [followTitle, setFollowTitle] = useState('');
  const [followDue, setFollowDue] = useState('');
  const [followAssignee, setFollowAssignee] = useState('');
  const [followFilter, setFollowFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming' | 'done' | 'mine'>('all');
  const [templateId, setTemplateId] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingRecordId, setSendingRecordId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ firstName: '', lastName: '', phone: '', email: '', isPrimary: false });
  const [addrForm, setAddrForm] = useState({ locationName: 'Home', street: '', unit: '', city: '', state: '', zip: '', gatedProperty: false, isDefault: false });
  const [editForm, setEditForm] = useState({
    name: '', email: '', phone: '', notes: '', tags: '', status: 'active',
    customerType: 'residential', source: '', paymentTerms: '', taxExempt: false,
    ownerUserId: '' as string,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['customers'] });
    await qc.invalidateQueries({ queryKey: ['follow-ups'] });
  };

  useEffect(() => {
    if (!customerQ.data) return;
    const c = customerQ.data;
    track({ kind: 'customer', id: c.id, label: c.name, href: `/admin/customers/${c.id}` });
  }, [customerQ.data, track]);

  const editBaseline = customer ? {
    name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes,
    tags: (customer.tags ?? []).join(', '), status: customer.status,
    customerType: customer.customerType || 'residential', source: customer.source || '',
    paymentTerms: customer.paymentTerms || '', taxExempt: !!customer.taxExempt,
    ownerUserId: customer.ownerUserId || '',
  } : null;
  useUnsavedGuard(Boolean(showEdit && editBaseline && JSON.stringify(editForm) !== JSON.stringify(editBaseline)));

  if (customerQ.isLoading) return <p className="text-muted-foreground">Loading customer…</p>;
  if (customerQ.isError || !customer) {
    const missing = customerQ.error instanceof ApiError && customerQ.error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">{missing ? 'Customer not found' : 'Could not load customer'}</p>
        <Button variant="outline" onClick={() => navigate('/admin/customers')}>Back to Customers</Button>
      </div>
    );
  }

  const contacts = customer.contacts ?? [];
  const addresses = customer.addresses ?? [];

  const openEdit = () => {
    setEditForm({
      name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes,
      tags: (customer.tags ?? []).join(', '), status: customer.status,
      customerType: customer.customerType || 'residential', source: customer.source || '',
      paymentTerms: customer.paymentTerms || '', taxExempt: !!customer.taxExempt,
      ownerUserId: customer.ownerUserId || '',
    });
    setShowEdit(true);
  };

  const handleSave = async () => {
    const err = requiredText(editForm.name, 'Name') || emailError(editForm.email) || phoneError(editForm.phone, { required: true });
    if (err) {
      toast.error(err);
      return;
    }
    const parts = editForm.name.trim().split(' ');
    await updateCustomer(customer.id, {
      firstName: parts[0] || '', lastName: parts.slice(1).join(' '),
      email: editForm.email, phone: editForm.phone, notes: editForm.notes,
      tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: editForm.status, customerType: editForm.customerType, source: editForm.source,
      paymentTerms: editForm.paymentTerms, taxExempt: editForm.taxExempt,
      ownerUserId: editForm.ownerUserId || null,
    });
    await refresh();
    setShowEdit(false);
    toast.success('Customer updated');
  };

  const handleConvertLead = async () => {
    await updateCustomer(customer.id, { status: 'active' });
    await refresh();
    toast.success('Lead converted to customer');
  };

  const handleInvoice = async () => {
    const job = billableJobs[0];
    if (!job) {
      toast.error('Add line items on a job first');
      return;
    }
    try {
      await generateInvoiceFromJob(job.id);
      toast.success('Invoice created');
      navigate('/admin/invoices');
    } catch (err: any) {
      toast.error(err?.message || 'Could not create invoice');
    }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { new: 'tint-slate', assigned: 'tint-indigo', in_progress: 'tint-info', completed: 'tint-success', cancelled: 'tint-slate' };
    return map[s] || '';
  };
  const invStatusColor = (s: string) => {
    const map: Record<string, string> = { draft: 'tint-slate', sent: 'tint-info', paid: 'tint-success', overdue: 'tint-danger' };
    return map[s] || '';
  };

  return (
    <div className="space-y-6">
      <CrmBreadcrumb items={[{ label: 'Customers', href: '/admin/customers' }, { label: customer.name }]} />
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/customers')}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-heading font-bold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">Customer since {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
        {customer.status === 'lead' && <Button variant="outline" className="gap-2" onClick={handleConvertLead}><Star className="w-4 h-4" /> Convert lead</Button>}
        <Button variant="outline" onClick={openEdit} className="gap-2"><Edit className="w-4 h-4" /> Edit</Button>
        {customer.archivedAt ? (
          <Button variant="outline" className="gap-2" onClick={async () => { await api.customers.restore(customer.id); toast.success('Restored'); refresh(); }}>
            <Archive className="w-4 h-4" /> Restore
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" onClick={async () => { await api.customers.archive(customer.id); toast.success('Archived'); refresh(); }}>
            <Archive className="w-4 h-4" /> Archive
          </Button>
        )}
        <RecordMarks entityType="customer" entityId={customer.id} starred={customer.starred} pinned={customer.pinned} />
        <Button variant="outline" className="text-destructive gap-2" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => navigate(`/admin/jobs?customerId=${customer.id}`)}>New Job</Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/estimates?customerId=${customer.id}`)}>New Estimate</Button>
        <Button size="sm" variant="outline" onClick={handleInvoice}>Create Invoice</Button>
        <Button size="sm" variant="outline" onClick={() => setShowFollow(true)}>Log follow-up</Button>
        <Button size="sm" variant="outline" onClick={() => setShowNote(true)}>Add note</Button>
        <Button size="sm" variant="outline" onClick={() => setShowEmail(true)}><Mail className="w-3.5 h-3.5 mr-1" /> Email</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-theme-sm lg:col-span-1">
          <CardContent className="p-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">{customer.name.charAt(0)}</div>
              <Badge variant="outline" className={customer.status === 'active' ? 'tint-success border-transparent' : customer.status === 'lead' ? 'tint-info border-transparent' : 'tint-slate border-transparent'}>{customer.status}</Badge>
              {customer.customerType && <Badge variant="secondary" className="capitalize">{customer.customerType}</Badge>}
            </div>
            <div className="space-y-3 text-sm">
              <CopyContact email={customer.email} phone={customer.phone} />
              <div className="flex items-start gap-3"><MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /><span>{customer.address || '—'}</span></div>
              {customer.source && <p className="text-xs text-muted-foreground">Source: {customer.source}</p>}
              {customer.paymentTerms && <p className="text-xs text-muted-foreground">Terms: {customer.paymentTerms}</p>}
              {customer.taxExempt && <Badge variant="outline" className="text-xs">Tax exempt</Badge>}
              {customer.archivedAt && <Badge variant="outline" className="text-destructive">Archived {new Date(customer.archivedAt).toLocaleDateString()}</Badge>}
              <p className="text-xs text-muted-foreground">Owner: {customer.ownerName || '—'}</p>
              {customer.createdByName && <p className="text-xs text-muted-foreground">Created by {customer.createdByName}</p>}
              {customer.updatedByName && <p className="text-xs text-muted-foreground">Updated by {customer.updatedByName}</p>}
            </div>
            {(customer.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">{customer.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div>
            )}
            {customer.notes && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Profile notes</p>
                <p>{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Jobs', value: customerJobs.length, icon: Briefcase },
              { label: 'Revenue (paid)', value: `$${liveRevenue.toLocaleString()}`, icon: DollarSign },
              { label: 'Estimates', value: customerEstimates.length, icon: Calculator },
              { label: 'Open follow-ups', value: (followQ.data ?? []).filter((f: any) => !f.done).length, icon: CheckCircle },
            ].map(s => (
              <Card key={s.label} className="shadow-theme-sm">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <s.icon className="w-5 h-5 text-primary" />
                  <p className="text-lg font-heading font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-theme-sm">
            <Tabs defaultValue="activity">
              <CardHeader className="pb-0">
                <TabsList className="w-full justify-start flex-wrap h-auto">
                  <TabsTrigger value="activity" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Activity</TabsTrigger>
                  <TabsTrigger value="contacts" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Contacts</TabsTrigger>
                  <TabsTrigger value="locations" className="gap-1.5"><Home className="w-3.5 h-3.5" /> Locations</TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1.5"><StickyNote className="w-3.5 h-3.5" /> Notes</TabsTrigger>
                  <TabsTrigger value="followups" className="gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Follow-ups</TabsTrigger>
                  <TabsTrigger value="jobs" className="gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Jobs</TabsTrigger>
                  <TabsTrigger value="estimates" className="gap-1.5"><Calculator className="w-3.5 h-3.5" /> Estimates</TabsTrigger>
                  <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Invoices</TabsTrigger>
                  <TabsTrigger value="comms" className="gap-1.5"><PhoneCall className="w-3.5 h-3.5" /> Comms</TabsTrigger>
                  <TabsTrigger value="documents" className="gap-1.5">Docs</TabsTrigger>
                  <TabsTrigger value="agreements" className="gap-1.5">Agreements</TabsTrigger>
                </TabsList>
              </CardHeader>

              <TabsContent value="activity">
                <CardContent className="p-4 space-y-3">
                  {(activityQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p> : (activityQ.data ?? []).map((a: any, i: number) => (
                    <button key={`${a.at}-${i}`} className="w-full text-left p-3 rounded-lg border hover:bg-muted/40" onClick={() => a.href && navigate(a.href)}>
                      <div className="flex justify-between gap-2">
                        <p className="text-sm font-medium capitalize">{a.title}</p>
                        <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
                      </div>
                      {a.detail && <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>}
                    </button>
                  ))}
                </CardContent>
              </TabsContent>

              <TabsContent value="contacts">
                <CardContent className="p-4 space-y-3">
                  <Button size="sm" className="gap-1" onClick={() => { setContactForm({ firstName: '', lastName: '', phone: '', email: '', isPrimary: false }); setShowContact(true); }}><Plus className="w-3.5 h-3.5" /> Add contact</Button>
                  {contacts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No contacts</p> : contacts.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{c.firstName} {c.lastName} {c.isPrimary && <Badge variant="secondary" className="text-[10px] ml-1">Primary</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{c.phone} · {c.email}</p>
                      </div>
                      <div className="flex gap-1">
                        {!c.isPrimary && <Button size="sm" variant="ghost" onClick={async () => { await api.customers.updateContact(customer.id, c.id, { isPrimary: true }); refresh(); }}>Primary</Button>}
                        {!c.isPrimary && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await api.customers.removeContact(customer.id, c.id); refresh(); }}>Remove</Button>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </TabsContent>

              <TabsContent value="locations">
                <CardContent className="p-4 space-y-3">
                  <Button size="sm" className="gap-1" onClick={() => { setAddrForm({ locationName: 'Home', street: '', unit: '', city: '', state: '', zip: '', gatedProperty: false, isDefault: false }); setShowAddress(true); }}><Plus className="w-3.5 h-3.5" /> Add location</Button>
                  {addresses.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No locations</p> : addresses.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{a.locationName || 'Location'} {a.isDefault && <Badge variant="secondary" className="text-[10px] ml-1">Default</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{a.formatted || `${a.street}, ${a.city}`}</p>
                      </div>
                      <div className="flex gap-1">
                        {!a.isDefault && <Button size="sm" variant="ghost" onClick={async () => { await api.customers.updateAddress(customer.id, a.id, { isDefault: true }); refresh(); }}>Default</Button>}
                        {!a.isDefault && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await api.customers.removeAddress(customer.id, a.id); refresh(); }}>Remove</Button>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </TabsContent>

              <TabsContent value="notes">
                <CardContent className="p-4 space-y-3">
                  <Button size="sm" className="gap-1" onClick={() => setShowNote(true)}><Plus className="w-3.5 h-3.5" /> Add note</Button>
                  {(notesQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p> : (notesQ.data ?? []).map((n: any) => (
                    <div key={n.id} className="p-3 rounded-lg border">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{n.authorName}</span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm">{n.body}</p>
                    </div>
                  ))}
                </CardContent>
              </TabsContent>

              <TabsContent value="followups">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-1" onClick={() => setShowFollow(true)}><Plus className="w-3.5 h-3.5" /> Add follow-up</Button>
                    {(['all', 'today', 'overdue', 'upcoming', 'done', 'mine'] as const).map((k) => (
                      <Button key={k} size="sm" variant={followFilter === k ? 'default' : 'outline'} onClick={() => setFollowFilter(k)}>
                        {k === 'all' ? 'All' : k === 'today' ? 'Due today' : k === 'overdue' ? 'Overdue' : k === 'upcoming' ? 'Upcoming' : k === 'done' ? 'Completed' : 'Assigned to me'}
                      </Button>
                    ))}
                  </div>
                  {(() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const list = (followQ.data ?? []).filter((f: any) => {
                      if (followFilter === 'done') return f.done;
                      if (followFilter === 'mine') return f.assignedUserId === currentUser?.id;
                      if (f.done) return followFilter === 'all';
                      if (followFilter === 'today') return f.dueDate === today;
                      if (followFilter === 'overdue') return f.dueDate && f.dueDate < today;
                      if (followFilter === 'upcoming') return f.dueDate && f.dueDate > today;
                      return true;
                    });
                    if (list.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">No follow-ups</p>;
                    return list.map((f: any) => {
                      const overdue = !f.done && f.dueDate && f.dueDate < today;
                      const dueToday = !f.done && f.dueDate === today;
                      const assignee = workers.find((w) => w.id === f.assignedUserId);
                      return (
                        <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border gap-3">
                          <div>
                            <p className={`text-sm font-medium ${f.done ? 'line-through text-muted-foreground' : ''}`}>{f.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Due {f.dueDate || '—'}
                              {assignee ? ` · ${assignee.name}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {overdue && <Badge variant="destructive">Overdue</Badge>}
                            {dueToday && <Badge>Today</Badge>}
                            {f.done && <Badge variant="secondary">Done</Badge>}
                            {!f.done && <Button size="sm" variant="outline" onClick={async () => { await api.followUps.update(f.id, { done: true }); refresh(); toast.success('Done'); }}>Complete</Button>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </CardContent>
              </TabsContent>

              <TabsContent value="jobs">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Scheduled</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {customerJobs.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No jobs yet</TableCell></TableRow>
                        : customerJobs.map(j => (
                          <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(`/admin/jobs/${j.id}`)}>
                            <TableCell className="font-medium text-sm">{j.title}</TableCell>
                            <TableCell><Badge variant="outline" className={statusColor(j.status)}>{j.status.replace('_', ' ')}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground">{j.scheduledDate || '—'}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </TabsContent>

              <TabsContent value="estimates">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Estimate</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {customerEstimates.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No estimates</TableCell></TableRow>
                        : customerEstimates.map(e => (
                          <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(`/admin/estimates/${e.id}`)}>
                            <TableCell className="font-medium text-sm">{e.estimateNumber}</TableCell>
                            <TableCell><Badge variant="outline">{e.status}</Badge></TableCell>
                            <TableCell className="text-right">${e.total.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </TabsContent>

              <TabsContent value="invoices">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {customerInvoices.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>
                        : customerInvoices.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium text-sm">{inv.invoiceNumber}</TableCell>
                            <TableCell><Badge variant="outline" className={invStatusColor(inv.status)}>{inv.status}</Badge></TableCell>
                            <TableCell className="text-right">${inv.total.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </TabsContent>

              <TabsContent value="comms">
                <CardContent className="p-4">
                  <CommunicationsThread toNumber={customer.phone} filter={{ customerId: customer.id }} title="Communication History" />
                </CardContent>
              </TabsContent>

              <TabsContent value="documents">
                <CardContent className="p-4">
                  {customerDocs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No documents</p> : customerDocs.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border mb-2">
                      <div className="flex items-center gap-3"><FileText className="w-5 h-5 text-primary" /><div><p className="text-sm font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.uploadedAt}</p></div></div>
                      <Button variant="ghost" size="sm" onClick={() => api.documents.download(d.id)}>Download</Button>
                    </div>
                  ))}
                </CardContent>
              </TabsContent>

              <TabsContent value="agreements">
                <CardContent className="p-4">
                  {customerAgreements.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No agreements</p> : customerAgreements.map(sa => (
                    <div key={sa.id} className="flex justify-between p-3 rounded-lg border mb-2">
                      <p className="text-sm font-medium">{sa.title}</p>
                      <Badge variant="outline">{sa.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      <Dialog open={showEdit} onOpenChange={(open) => {
        if (!open && !confirmDiscard(JSON.stringify(editForm) !== JSON.stringify({
          name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes,
          tags: (customer.tags ?? []).join(', '), status: customer.status,
          customerType: customer.customerType || 'residential', source: customer.source || '',
          paymentTerms: customer.paymentTerms || '', taxExempt: !!customer.taxExempt,
          ownerUserId: customer.ownerUserId || '',
        }))) return;
        setShowEdit(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={editForm.customerType} onValueChange={v => setEditForm(f => ({ ...f, customerType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Source</Label><Input value={editForm.source} onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Payment terms</Label><Input value={editForm.paymentTerms} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="Net 30" /></div>
              <div><Label>Tags</Label><Input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={editForm.taxExempt} onCheckedChange={v => setEditForm(f => ({ ...f, taxExempt: !!v }))} /> Tax exempt</label>
            <OwnerPicker value={editForm.ownerUserId} onChange={(id) => setEditForm(f => ({ ...f, ownerUserId: id || '' }))} />
            <div><Label>Profile notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContact} onOpenChange={setShowContact}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First</Label><Input value={contactForm.firstName} onChange={e => setContactForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label>Last</Label><Input value={contactForm.lastName} onChange={e => setContactForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={contactForm.isPrimary} onCheckedChange={v => setContactForm(f => ({ ...f, isPrimary: !!v }))} /> Set as primary</label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContact(false)}>Cancel</Button>
            <Button onClick={async () => {
              const err = requiredText(contactForm.firstName, 'First name')
                || emailError(contactForm.email)
                || phoneError(contactForm.phone);
              if (err) { toast.error(err); return; }
              await api.customers.addContact(customer.id, {
                ...contactForm,
                firstName: contactForm.firstName.trim(),
                lastName: contactForm.lastName.trim(),
                email: contactForm.email.trim(),
                phone: contactForm.phone.trim(),
              });
              setShowContact(false); refresh(); toast.success('Contact added');
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddress} onOpenChange={setShowAddress}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add location</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Location name" value={addrForm.locationName} onChange={e => setAddrForm(f => ({ ...f, locationName: e.target.value }))} />
            <Input placeholder="Street" value={addrForm.street} onChange={e => setAddrForm(f => ({ ...f, street: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City" value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} />
              <Input placeholder="State" value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} />
              <Input placeholder="Zip" value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={addrForm.isDefault} onCheckedChange={v => setAddrForm(f => ({ ...f, isDefault: !!v }))} /> Default</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddress(false)}>Cancel</Button>
            <Button onClick={async () => {
              const err = requiredText(addrForm.street, 'Street') || requiredText(addrForm.city, 'City');
              if (err) { toast.error(err); return; }
              await api.customers.addAddress(customer.id, addrForm);
              setShowAddress(false); refresh(); toast.success('Location added');
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add note</DialogTitle></DialogHeader>
          <Textarea rows={4} value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="What happened..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNote(false)}>Cancel</Button>
            <Button disabled={!noteBody.trim()} onClick={async () => {
              await api.customers.addNote(customer.id, noteBody.trim());
              setNoteBody(''); setShowNote(false); refresh(); toast.success('Note added');
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFollow} onOpenChange={setShowFollow}>
        <DialogContent>
          <DialogHeader><DialogTitle>Follow-up</DialogTitle></DialogHeader>
          <Input placeholder="Call back about leak..." value={followTitle} onChange={e => setFollowTitle(e.target.value)} />
          <div><Label>Due date</Label><Input type="date" value={followDue} onChange={e => setFollowDue(e.target.value)} /></div>
          <div>
            <Label>Assign to</Label>
            <Select value={followAssignee || 'none'} onValueChange={(v) => setFollowAssignee(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {currentUser && !workers.some(w => w.id === currentUser.id) && (
                  <SelectItem value={currentUser.id}>{currentUser.name} (me)</SelectItem>
                )}
                {workers.filter(w => !currentUser?.companyId || w.companyId === currentUser.companyId).map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFollow(false)}>Cancel</Button>
            <Button disabled={!followTitle.trim()} onClick={async () => {
              if (!followDue) { toast.error('Due date is required'); return; }
              await api.followUps.create({
                customerId: customer.id,
                title: followTitle.trim(),
                dueDate: followDue || undefined,
                assignedUserId: followAssignee || undefined,
              });
              setFollowTitle(''); setFollowDue(''); setFollowAssignee(''); setShowFollow(false); refresh(); toast.success('Follow-up created');
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmail} onOpenChange={(open) => {
        setShowEmail(open);
        if (!open) { setTemplateId(''); setEmailMessage(''); setSendingRecordId(null); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Send customer email</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Sends through your company SMTP (Tenant Email). FieldPro platform SMTP is not used.</p>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
            <SelectContent>
              {emailTemplates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(() => {
            const tpl = emailTemplates.find((t: any) => t.id === templateId);
            const type = tpl?.type as string | undefined;
            const sendRecord = async (payload: Record<string, string>) => {
              const key = payload.invoiceId || payload.jobId || payload.estimateId || payload.followUpId || 'note';
              setSendingRecordId(key);
              try {
                await api.communications.sendTemplate({
                  templateId,
                  customerId: customer.id,
                  ...payload,
                });
                qc.invalidateQueries({ queryKey: ['communications'] });
                refresh();
                toast.success('Email sent');
                return true;
              } catch (err: any) {
                toast.error(err?.message || 'Could not send');
                return false;
              } finally {
                setSendingRecordId(null);
              }
            };
            if (!type) return null;
            if (type === 'invoice') {
              return (
                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                  {customerInvoices.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-4">No invoices for this customer</p>
                    : customerInvoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{inv.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{inv.status} · ${Number(inv.total || 0).toLocaleString()}</p>
                        </div>
                        <Button size="sm" disabled={sendingRecordId !== null} onClick={() => void sendRecord({ invoiceId: inv.id })}>
                          {sendingRecordId === inv.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                          Send
                        </Button>
                      </div>
                    ))}
                </div>
              );
            }
            if (type === 'appointment') {
              const appts = customerJobs.filter((j) => j.scheduledDate);
              const list = appts.length ? appts : customerJobs;
              return (
                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                  {list.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-4">No appointments for this customer</p>
                    : list.map((j) => (
                      <div key={j.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.scheduledDate || 'Unscheduled'}{j.scheduledTime ? ` · ${j.scheduledTime}` : ''}</p>
                        </div>
                        <Button size="sm" disabled={sendingRecordId !== null} onClick={() => void sendRecord({ jobId: j.id })}>
                          {sendingRecordId === j.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                          Send
                        </Button>
                      </div>
                    ))}
                </div>
              );
            }
            if (type === 'estimate') {
              return (
                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                  {customerEstimates.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-4">No estimates for this customer</p>
                    : customerEstimates.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{e.estimateNumber}</p>
                          <p className="text-xs text-muted-foreground">{e.status} · ${Number(e.total || 0).toLocaleString()}</p>
                        </div>
                        <Button size="sm" disabled={sendingRecordId !== null} onClick={() => void sendRecord({ estimateId: e.id })}>
                          {sendingRecordId === e.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                          Send
                        </Button>
                      </div>
                    ))}
                </div>
              );
            }
            if (type === 'follow_up') {
              const list = followQ.data ?? [];
              return (
                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                  {list.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-4">No follow-ups for this customer</p>
                    : list.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{f.title}</p>
                          <p className="text-xs text-muted-foreground">Due {f.dueDate || '—'}</p>
                        </div>
                        <Button size="sm" disabled={sendingRecordId !== null} onClick={() => void sendRecord({ followUpId: f.id })}>
                          {sendingRecordId === f.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                          Send
                        </Button>
                      </div>
                    ))}
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <Textarea
                  placeholder="Optional note for {message} in the template"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={sendingRecordId !== null}
                  onClick={async () => {
                    const ok = await sendRecord({ message: emailMessage });
                    if (ok) setShowEmail(false);
                  }}
                >
                  {sendingRecordId === 'note' && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Send to customer
                </Button>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmail(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{customer.name}</strong>? Jobs and invoices linked to this customer may block delete.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { deleteCustomer(customer.id); navigate('/admin/customers'); toast.success('Customer deleted'); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerProfile;
