import { useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Edit, Trash2, Eye, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Company } from '@/store/types';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { applyErrors, emailError, requiredText } from '@/lib/formValidation';

const Companies = () => {
  const navigate = useNavigate();
  const { companies, plans, addCompany, updateCompany, deleteCompany } = useFieldPro();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<Company | null>(null);
  const [showDetail, setShowDetail] = useState<Company | null>(null);
  const [showDelete, setShowDelete] = useState<Company | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; phone: string; address: string; planId: string; status: 'active' | 'suspended' | 'trial' }>({ name: '', email: '', phone: '', address: '', planId: '', status: 'active' });

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    const next = applyErrors({
      name: requiredText(form.name, 'Company name'),
      email: emailError(form.email, { required: true }),
      planId: form.planId || plans[0]?.id ? '' : 'Select a subscription plan',
    });
    if (Object.values(next).some(Boolean)) {
      toast.error(Object.values(next).find(Boolean));
      return;
    }
    const planId = form.planId || plans[0]?.id;
    try {
      await addCompany({ ...form, planId });
      toast.success(`${form.name} added successfully!`);
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '', address: '', planId: plans[0]?.id || '', status: 'active' });
    } catch (err: any) {
      toast.error(err?.message || 'Could not add company');
    }
  };

  const handleEdit = () => {
    if (showEdit) {
      updateCompany(showEdit.id, form);
      toast.success(`${form.name} updated!`);
      setShowEdit(null);
    }
  };

  const handleDelete = () => {
    if (showDelete) {
      deleteCompany(showDelete.id);
      toast.success(`${showDelete.name} deleted`);
      setShowDelete(null);
    }
  };

  const statusColor = (s: string) => s === 'active' ? 'tint-success' : s === 'trial' ? 'tint-warning' : 'tint-danger';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Company Management</h1>
          <p className="text-muted-foreground text-sm">{companies.length} companies registered</p>
        </div>
        <Button onClick={() => { setForm(f => ({ ...f, planId: f.planId || plans[0]?.id || '' })); setShowAdd(true); }} className="gradient-primary text-primary-foreground gap-2">
          <Plus className="w-4 h-4" /> Add Company
        </Button>
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c, i) => (
                  <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="cursor-pointer hover:bg-muted/50" onClick={() => setShowDetail(c)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="w-4 h-4 text-primary" /></div>
                        <div><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-muted-foreground">{c.email}</p></div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{plans.find(p => p.id === c.planId)?.name}</Badge></TableCell>
                    <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(c.status)}`}>{c.status}</span></TableCell>
                    <TableCell>{c.employeeCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/super-admin/companies/${c.id}`)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowEdit(c); setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address, planId: c.planId, status: c.status }); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setShowDelete(c)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd || !!showEdit} onOpenChange={() => { setShowAdd(false); setShowEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{showEdit ? 'Edit Company' : 'Add Company'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Company Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.planId || undefined} onValueChange={v => setForm({ ...form, planId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name} - ${p.price}/mo</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setShowEdit(null); }}>Cancel</Button>
            <Button onClick={showEdit ? handleEdit : handleAdd} className="gradient-primary text-primary-foreground">{showEdit ? 'Save Changes' : 'Add Company'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{showDetail?.name}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{showDetail.email}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{showDetail.phone}</p></div>
                <div><span className="text-muted-foreground">Plan:</span><p className="font-medium">{plans.find(p => p.id === showDetail.planId)?.name}</p></div>
                <div><span className="text-muted-foreground">Status:</span><p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(showDetail.status)}`}>{showDetail.status}</span></p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span><p className="font-medium">{showDetail.address}</p></div>
                <div><span className="text-muted-foreground">Employees:</span><p className="font-medium">{showDetail.employeeCount}</p></div>
                <div><span className="text-muted-foreground">Created:</span><p className="font-medium">{showDetail.createdAt}</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Company</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{showDelete?.name}</strong>? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Companies;
