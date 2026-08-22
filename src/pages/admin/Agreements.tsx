import { useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Eye, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ServiceAgreement } from '@/store/types';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, dateOrderError, requiredText } from '@/lib/formValidation';

const statusColors: Record<string, string> = { draft: 'tint-slate', active: 'tint-success', expired: 'tint-danger' };

const AdminAgreements = () => {
  const { currentUser, serviceAgreements, customers, addServiceAgreement, updateServiceAgreement } = useFieldPro();
  const agreements = serviceAgreements.filter(a => a.companyId === currentUser?.companyId);
  const companyCustomers = customers.filter(c => c.companyId === currentUser?.companyId);
  const [showDetail, setShowDetail] = useState<ServiceAgreement | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', startDate: '', endDate: '', terms: '' });
  const [showAdd, setShowAdd] = useState(false);
  const emptyAgreement = { title: '', customerId: '', startDate: '', endDate: '', terms: '' };
  const [form, setForm] = useState(emptyAgreement);
  const [agErrors, setAgErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const agreementDirty = JSON.stringify(form) !== JSON.stringify(emptyAgreement);
  useUnsavedGuard(showAdd && agreementDirty);

  const openDetail = (a: ServiceAgreement) => {
    setShowDetail(a);
    setEditingDetail(false);
    setEditForm({ title: a.title, startDate: a.startDate, endDate: a.endDate, terms: a.terms || '' });
  };

  const handleSaveEdit = async () => {
    if (!showDetail) return;
    const next = applyErrors({
      title: requiredText(editForm.title, 'Title'),
      startDate: requiredText(editForm.startDate, 'Start date'),
      endDate: requiredText(editForm.endDate, 'End date') || dateOrderError(editForm.startDate, editForm.endDate),
    });
    if (Object.values(next).some(Boolean)) {
      toast.error(Object.values(next).find(Boolean));
      return;
    }
    try {
      await updateServiceAgreement(showDetail.id, editForm);
      setShowDetail({ ...showDetail, ...editForm });
      setEditingDetail(false);
      toast.success('Agreement updated');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update agreement');
    }
  };
  const visible = agreements.filter(a =>
    !search.trim()
    || a.title.toLowerCase().includes(search.toLowerCase())
    || (a.customerName || '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = async () => {
    const next = applyErrors({
      title: requiredText(form.title, 'Title'),
      customerId: form.customerId ? '' : 'Select a customer',
      startDate: requiredText(form.startDate, 'Start date'),
      endDate: requiredText(form.endDate, 'End date') || dateOrderError(form.startDate, form.endDate),
    });
    setAgErrors(next);
    if (Object.values(next).some(Boolean)) return;
    try {
      await addServiceAgreement(form);
      toast.success('Agreement created!');
      setShowAdd(false);
      setForm({ title: '', customerId: '', startDate: '', endDate: '', terms: '' });
    } catch (err: any) {
      toast.error(err?.message || 'Could not create agreement');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-heading font-bold">Service Agreements</h1><p className="text-muted-foreground text-sm">{agreements.length} agreements</p></div>
        <Button onClick={() => setShowAdd(true)} className="gradient-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" /> Create Agreement</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search agreements..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">
          {search ? 'No agreements match your search.' : 'No agreements yet.'}
        </p>
      )}
      <div className="grid gap-4">{visible.map(a => (
        <Card key={a.id} className="shadow-theme-sm hover:shadow-theme-md transition-shadow cursor-pointer" onClick={() => openDetail(a)}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="font-medium text-sm">{a.title}</p><p className="text-xs text-muted-foreground">{a.customerName} · {a.startDate} to {a.endDate}</p></div>
            <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[a.status]}`}>{a.status}</span><Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button></div>
          </CardContent>
        </Card>
      ))}</div>
      <Dialog open={!!showDetail} onOpenChange={(open) => { if (!open) { setShowDetail(null); setEditingDetail(false); } }}><DialogContent><DialogHeader><DialogTitle>{editingDetail ? 'Edit Agreement' : showDetail?.title}</DialogTitle></DialogHeader>
        {showDetail && <div className="space-y-3 text-sm">
          {editingDetail ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-start">Start Date</Label>
                  <Input id="edit-start" type="date" value={editForm.startDate} onChange={e => setEditForm({ ...editForm, startDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-end">End Date</Label>
                  <Input id="edit-end" type="date" value={editForm.endDate} onChange={e => setEditForm({ ...editForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Terms</Label>
                <Textarea value={editForm.terms} onChange={e => setEditForm({ ...editForm, terms: e.target.value })} rows={4} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingDetail(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit} className="gradient-primary text-primary-foreground">Save</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3"><div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{showDetail.customerName}</p></div><div><span className="text-muted-foreground">Status:</span><p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[showDetail.status]}`}>{showDetail.status}</span></p></div><div><span className="text-muted-foreground">Start:</span><p className="font-medium">{showDetail.startDate}</p></div><div><span className="text-muted-foreground">End:</span><p className="font-medium">{showDetail.endDate}</p></div></div>
              <div><span className="text-muted-foreground">Terms:</span><p className="mt-1 bg-muted/50 rounded p-3 text-sm">{showDetail.terms}</p></div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" className="w-full gap-2" onClick={() => {
                  setEditForm({ title: showDetail.title, startDate: showDetail.startDate, endDate: showDetail.endDate, terms: showDetail.terms || '' });
                  setEditingDetail(true);
                }}><Pencil className="w-4 h-4" /> Edit</Button>
                {showDetail.status === 'draft' && <Button className="w-full" onClick={() => { updateServiceAgreement(showDetail.id, { status: 'active' }); toast.success('Agreement activated!'); setShowDetail({ ...showDetail, status: 'active' }); }}>Activate Agreement</Button>}
                {showDetail.status === 'active' && <Button variant="outline" className="w-full" onClick={() => { updateServiceAgreement(showDetail.id, { status: 'expired' }); toast.success('Agreement marked expired'); setShowDetail({ ...showDetail, status: 'expired' }); }}>Mark expired</Button>}
              </div>
            </>
          )}
        </div>}
      </DialogContent></Dialog>
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open && !confirmDiscard(agreementDirty)) return; setShowAdd(open); if (!open) setForm(emptyAgreement); }}><DialogContent><DialogHeader><DialogTitle>New Agreement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setAgErrors(x => ({ ...x, title: '' })); }} {...fieldInvalidProps('title', agErrors.title)} />
            <FieldError id="title-error" message={agErrors.title} />
          </div>
          <div className="space-y-2"><Label>Customer</Label>
            <Select value={form.customerId || undefined} onValueChange={v => { setForm({ ...form, customerId: v }); setAgErrors(x => ({ ...x, customerId: '' })); }}>
              <SelectTrigger aria-invalid={Boolean(agErrors.customerId) || undefined}><SelectValue placeholder="Select a customer" /></SelectTrigger>
              <SelectContent>
                {companyCustomers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError message={agErrors.customerId} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => { setForm({ ...form, startDate: e.target.value }); setAgErrors(x => ({ ...x, startDate: '' })); }} {...fieldInvalidProps('startDate', agErrors.startDate)} />
              <FieldError id="startDate-error" message={agErrors.startDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => { setForm({ ...form, endDate: e.target.value }); setAgErrors(x => ({ ...x, endDate: '' })); }} {...fieldInvalidProps('endDate', agErrors.endDate)} />
              <FieldError id="endDate-error" message={agErrors.endDate} />
            </div>
          </div>
          <div className="space-y-2"><Label>Terms</Label><Textarea value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} rows={4} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { if (confirmDiscard(agreementDirty)) { setShowAdd(false); setForm(emptyAgreement); } }}>Cancel</Button><Button onClick={handleAdd} className="gradient-primary text-primary-foreground">Create</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};
export default AdminAgreements;
