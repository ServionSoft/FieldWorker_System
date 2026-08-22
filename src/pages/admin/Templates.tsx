import { useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Eye, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, requiredText } from '@/lib/formValidation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AdminTemplates = () => {
  const { currentUser, emailTemplates, addEmailTemplate, updateEmailTemplate, deleteEmailTemplate } = useFieldPro();
  const templates = emailTemplates.filter(t => t.companyId === currentUser?.companyId);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const emptyTpl = { name: '', subject: '', body: '', type: 'invoice' as const };
  const [form, setForm] = useState<{ name: string; subject: string; body: string; type: 'invoice' | 'appointment' | 'follow_up' | 'estimate' | 'customer_communication' }>(emptyTpl);
  const editingTpl = showEdit ? templates.find(t => t.id === showEdit) : null;
  const tplDirty = JSON.stringify(form) !== JSON.stringify(editingTpl
    ? { name: editingTpl.name, subject: editingTpl.subject, body: editingTpl.body, type: editingTpl.type }
    : emptyTpl);
  useUnsavedGuard((showAdd || !!showEdit) && tplDirty);
  const closeTpl = () => {
    if (!confirmDiscard(tplDirty)) return;
    setShowAdd(false); setShowEdit(null); setForm(emptyTpl);
  };

  const handleSave = () => {
    const next = applyErrors({
      name: requiredText(form.name, 'Name'),
      subject: requiredText(form.subject, 'Subject'),
      body: requiredText(form.body, 'Body'),
    });
    if (Object.values(next).some(Boolean)) {
      toast.error(Object.values(next).find(Boolean));
      return;
    }
    if (showEdit) {
      updateEmailTemplate(showEdit, form);
      toast.success('Template updated!');
      setShowEdit(null);
    } else {
      addEmailTemplate({ id: `et${Date.now()}`, ...form, companyId: currentUser?.companyId || '' });
      toast.success('Template created!');
      setShowAdd(false);
    }
    setForm({ name: '', subject: '', body: '', type: 'invoice' });
  };

  const preview = showPreview ? templates.find(t => t.id === showPreview) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-heading font-bold">Customer email templates</h1><p className="text-muted-foreground text-sm">{templates.length} templates · used only with your company SMTP for customer mail. Password reset and invites are FieldPro system emails.</p></div>
        <Button onClick={() => setShowAdd(true)} className="gradient-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" /> New Template</Button>
      </div>
      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No templates yet. Create one to reuse email copy.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{templates.map(t => (
        <Card key={t.id} className="shadow-theme-sm hover:shadow-theme-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><p className="font-medium text-sm">{t.name}</p></div>
              <Badge variant="secondary" className="text-xs">{t.type}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Subject: {t.subject}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowPreview(t.id)} className="gap-1"><Eye className="w-3 h-3" /> Preview</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowEdit(t.id); setForm({ name: t.name, subject: t.subject, body: t.body, type: t.type }); }} className="gap-1"><Edit className="w-3 h-3" /> Edit</Button>
              <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive" onClick={() => {
                if (!window.confirm(`Delete template "${t.name}"?`)) return;
                deleteEmailTemplate(t.id);
                toast.success('Template deleted');
              }}><Trash2 className="w-3 h-3" /> Delete</Button>
            </div>
          </CardContent>
        </Card>
      ))}</div>
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Preview: {preview?.name}</DialogTitle></DialogHeader>
        {preview && <div className="space-y-3"><div className="bg-muted/50 rounded-lg p-4"><p className="text-sm font-medium mb-1">Subject: {preview.subject}</p><pre className="text-sm whitespace-pre-wrap text-muted-foreground">{preview.body}</pre></div></div>}
      </DialogContent></Dialog>
      <Dialog open={showAdd || !!showEdit} onOpenChange={(open) => { if (!open) closeTpl(); }}><DialogContent><DialogHeader><DialogTitle>{showEdit ? 'Edit Template' : 'New Template'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} {...fieldInvalidProps('name')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} {...fieldInvalidProps('subject')} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="estimate">Estimate</SelectItem>
                <SelectItem value="appointment">Appointment</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="customer_communication">Customer communication</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={8} id="body" name="body" />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={closeTpl}>Cancel</Button><Button onClick={handleSave} className="gradient-primary text-primary-foreground">Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
};
export default AdminTemplates;
