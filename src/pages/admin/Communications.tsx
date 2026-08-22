import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, MessageSquare, Voicemail, PhoneIncoming, PhoneOutgoing, PhoneMissed, ArrowDownLeft, ArrowUpRight, Search, User, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CommunicationType } from '@/store/types';

type LogChannel = 'email' | 'sms' | 'call' | 'note';

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 60000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}m ago`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
  if (diff < 60 * 24 * 7) return `${Math.floor(diff / (60 * 24))}d ago`;
  return d.toLocaleDateString();
};

const formatDuration = (s?: number) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const emptyLog = { customerId: '', channel: 'email' as LogChannel, subject: '', body: '' };

const Communications = () => {
  const { communications, customers, currentUser, markCommunicationRead, markAllCommunicationsRead, addCommunication } = useFieldPro();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | CommunicationType>('all');
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState(emptyLog);
  const [saving, setSaving] = useState(false);

  const companyCustomers = useMemo(
    () => customers.filter(c => c.companyId === currentUser?.companyId),
    [customers, currentUser?.companyId],
  );

  const companyComms = useMemo(
    () => communications
      .filter(c => c.companyId === currentUser?.companyId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [communications, currentUser?.companyId]
  );

  const customerName = (id?: string) => customers.find(c => c.id === id)?.name || 'Unknown';

  const filtered = companyComms.filter(c => {
    if (tab !== 'all' && c.type !== tab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      customerName(c.customerId).toLowerCase().includes(q) ||
      c.fromNumber.toLowerCase().includes(q) ||
      c.toNumber.toLowerCase().includes(q) ||
      (c.body || '').toLowerCase().includes(q)
    );
  });

  const counts = {
    all: companyComms.length,
    call: companyComms.filter(c => c.type === 'call').length,
    sms: companyComms.filter(c => c.type === 'sms').length,
    voicemail: companyComms.filter(c => c.type === 'voicemail').length,
  };

  const unread = companyComms.filter(c => !c.read).length;

  const handleLogSave = async () => {
    if (!logForm.customerId) {
      toast.error('Select a customer');
      return;
    }
    if (!logForm.body.trim() && !logForm.subject.trim()) {
      toast.error('Enter a subject or body');
      return;
    }
    const customer = companyCustomers.find(c => c.id === logForm.customerId);
    const status = logForm.channel === 'call' ? 'completed' : logForm.channel === 'sms' ? 'sent' : 'sent';
    const bodyText = [logForm.subject.trim() && `Subject: ${logForm.subject.trim()}`, logForm.body.trim()]
      .filter(Boolean)
      .join('\n\n');
    setSaving(true);
    try {
      await addCommunication({
        type: logForm.channel,
        direction: 'outbound',
        status,
        fromNumber: 'office',
        toNumber: customer?.phone || customer?.email || '',
        customerId: logForm.customerId,
        body: bodyText,
      });
      toast.success('Communication logged');
      setShowLog(false);
      setLogForm(emptyLog);
    } catch (err: any) {
      toast.error(err?.message || 'Could not log communication');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Communications</h1>
          <p className="text-sm text-muted-foreground">All calls, texts, and voicemails across your company</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5" onClick={() => setShowLog(true)}>
            <Plus className="w-4 h-4" /> Log communication
          </Button>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllCommunicationsRead({ companyId: currentUser?.companyId })}>
              Mark all read ({unread})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.all, icon: MessageSquare, color: 'text-primary' },
          { label: 'Calls', value: counts.call, icon: Phone, color: 'text-emerald-600' },
          { label: 'Texts', value: counts.sms, icon: MessageSquare, color: 'text-blue-600' },
          { label: 'Voicemails', value: counts.voicemail, icon: Voicemail, color: 'text-violet-600' },
        ].map(s => (
          <Card key={s.label} className="shadow-theme-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-lg font-heading font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, number, or content..." className="pl-9" />
            </div>
            <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="call">Calls</TabsTrigger>
                <TabsTrigger value="sms">Texts</TabsTrigger>
                <TabsTrigger value="voicemail">Voicemail</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No communications match your filters</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
                const Icon = c.type === 'call' ? Phone : c.type === 'voicemail' ? Voicemail : MessageSquare;
                const DirIcon = (c.type === 'call' || c.type === 'voicemail')
                  ? (c.status === 'missed' ? PhoneMissed : c.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming)
                  : c.direction === 'outbound' ? ArrowUpRight : ArrowDownLeft;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      if (!c.read) markCommunicationRead(c.id);
                      if (c.customerId) navigate(`/admin/customers/${c.customerId}`);
                    }}
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      c.read ? 'bg-card hover:bg-muted/40' : 'bg-primary/5 border-primary/30 hover:bg-primary/10'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      c.type === 'call' ? 'tint-success' :
                      c.type === 'voicemail' ? 'tint-purple' :
                      'tint-info'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium text-sm truncate">{customerName(c.customerId)}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {c.type === 'sms' ? 'Text' : c.type}
                          </Badge>
                          <DirIcon className={`w-3 h-3 ${c.status === 'missed' || c.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`} />
                          {!c.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatTime(c.timestamp)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.direction === 'outbound' ? `→ ${c.toNumber}` : `← ${c.fromNumber}`}
                        {c.userName && ` · ${c.userName}`}
                        {c.type === 'call' ? ` · ${formatDuration(c.durationSec)}` : ''}
                        {' · '}<span className="capitalize">{c.status.replace('_', ' ')}</span>
                      </p>
                      {c.body && <p className="text-sm mt-1 line-clamp-2">{c.body}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLog} onOpenChange={(open) => { setShowLog(open); if (!open) setLogForm(emptyLog); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log communication</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={logForm.customerId || undefined} onValueChange={v => setLogForm(f => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {companyCustomers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={logForm.channel} onValueChange={v => setLogForm(f => ({ ...f, channel: v as LogChannel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={logForm.subject} onChange={e => setLogForm(f => ({ ...f, subject: e.target.value }))} placeholder="Optional subject" />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea value={logForm.body} onChange={e => setLogForm(f => ({ ...f, body: e.target.value }))} rows={4} placeholder="What was said or noted..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleLogSave} className="gradient-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Communications;
