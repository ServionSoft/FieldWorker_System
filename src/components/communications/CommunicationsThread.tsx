import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Communication, CommunicationType } from '@/store/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone, MessageSquare, Voicemail, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  ArrowDownLeft, ArrowUpRight, Play, Filter, Mail, FileText, Calculator,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  /** Customer phone for outbound default */
  toNumber: string;
  /** Pre-filter the thread */
  filter: {
    customerId?: string;
    jobId?: string;
    estimateId?: string;
  };
  /** Compact (worker mobile) layout */
  compact?: boolean;
  /** Title shown above the thread */
  title?: string;
}

const typeIcon: Record<CommunicationType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  sms: MessageSquare,
  voicemail: Voicemail,
  mms: MessageSquare,
  email: Mail,
};

const formatDuration = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 60000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}m ago`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
  if (diff < 60 * 24 * 7) return `${Math.floor(diff / (60 * 24))}d ago`;
  return d.toLocaleDateString();
};

const CommunicationsThread: React.FC<Props> = ({ toNumber, filter, compact, title = 'Communications' }) => {
  const qc = useQueryClient();
  const { communications, company, markCommunicationRead, customers, jobs, estimates, invoices } = useFieldPro();
  const [showCall, setShowCall] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [attachInvoice, setAttachInvoice] = useState(false);
  const [attachEstimate, setAttachEstimate] = useState(false);
  const [attachInvoiceId, setAttachInvoiceId] = useState('');
  const [attachEstimateId, setAttachEstimateId] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | CommunicationType>('all');

  const companyLine = company?.phone || '(555) 000-0000';

  // Resolve linked entities for context label
  const resolveCustomerId = (): string | undefined => {
    if (filter.customerId) return filter.customerId;
    if (filter.jobId) return jobs.find(j => j.id === filter.jobId)?.customerId;
    if (filter.estimateId) return estimates.find(e => e.id === filter.estimateId)?.customerId;
    return undefined;
  };

  const relatedInvoices = useMemo(() => {
    const cid = resolveCustomerId();
    const job = filter.jobId ? jobs.find(j => j.id === filter.jobId) : undefined;
    return invoices
      .filter((inv: any) => {
        if (filter.jobId && (inv.jobId === filter.jobId || job?.invoiceId === inv.id)) return true;
        if (cid && inv.customerId === cid) return true;
        return false;
      })
      .sort((a: any, b: any) => {
        const aJob = a.jobId === filter.jobId || job?.invoiceId === a.id ? 0 : 1;
        const bJob = b.jobId === filter.jobId || job?.invoiceId === b.id ? 0 : 1;
        return aJob - bJob;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, jobs, filter.jobId, filter.customerId, filter.estimateId, customers]);

  const relatedEstimates = useMemo(() => {
    const cid = resolveCustomerId();
    const job = filter.jobId ? jobs.find(j => j.id === filter.jobId) : undefined;
    return estimates
      .filter((est) => {
        if (filter.estimateId && est.id === filter.estimateId) return true;
        if (job?.estimateId && est.id === job.estimateId) return true;
        if (cid && est.customerId === cid) return true;
        return false;
      })
      .sort((a, b) => {
        const aLink = (filter.estimateId && a.id === filter.estimateId) || (job?.estimateId && a.id === job.estimateId) ? 0 : 1;
        const bLink = (filter.estimateId && b.id === filter.estimateId) || (job?.estimateId && b.id === job.estimateId) ? 0 : 1;
        return aLink - bLink;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, jobs, filter.jobId, filter.customerId, filter.estimateId, customers]);

  const thread = useMemo(() => {
    const cid = resolveCustomerId();
    return communications
      .filter(c => {
        if (filter.jobId) return c.jobId === filter.jobId;
        if (filter.estimateId) return c.estimateId === filter.estimateId;
        if (cid) return c.customerId === cid;
        return false;
      })
      .filter(c => typeFilter === 'all' || c.type === typeFilter)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communications, filter.jobId, filter.estimateId, filter.customerId, typeFilter]);

  const unreadCount = thread.filter(c => !c.read).length;

  const handleLogCall = async () => {
    setBusy(true);
    try {
      await api.communications.create({
        type: 'call',
        direction: 'outbound',
        status: 'completed',
        fromNumber: companyLine,
        toNumber,
        customerId: resolveCustomerId(),
        jobId: filter.jobId,
        estimateId: filter.estimateId,
        body: callNotes.trim() || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['communications'] });
      toast.success('Call logged');
      setShowCall(false);
      setCallNotes('');
    } catch (err: any) {
      toast.error(err?.message || 'Could not log call');
    } finally {
      setBusy(false);
    }
  };

  const handleSendSms = async () => {
    if (!smsBody.trim()) return;
    setBusy(true);
    try {
      await api.communications.sendSms({
        to: toNumber,
        body: smsBody.trim(),
        customerId: resolveCustomerId(),
        jobId: filter.jobId,
        estimateId: filter.estimateId,
      });
      await qc.invalidateQueries({ queryKey: ['communications'] });
      toast.success('SMS sent via Twilio');
      setSmsBody('');
      setShowSms(false);
    } catch (err: any) {
      toast.error(err?.message || 'SMS failed. Check Twilio settings.');
    } finally {
      setBusy(false);
    }
  };

  const resolvedToEmail = (): string => {
    const cid = resolveCustomerId();
    const cust = customers.find(c => c.id === cid);
    if (cust?.email) return cust.email;
    if (filter.jobId) {
      const job = jobs.find(j => j.id === filter.jobId);
      if (job?.customerEmail) return job.customerEmail;
      if (job?.primaryContact?.email) return job.primaryContact.email;
    }
    if (filter.estimateId) {
      const est = estimates.find(e => e.id === filter.estimateId);
      if (est?.customerEmail) return est.customerEmail;
    }
    return '';
  };

  const defaultEmailSubject = (): string => {
    if (filter.jobId) {
      const job = jobs.find(j => j.id === filter.jobId);
      if (job?.title) return `Re: ${job.title}`;
    }
    if (filter.estimateId) {
      const est = estimates.find(e => e.id === filter.estimateId);
      if (est?.estimateNumber) return `Re: ${est.estimateNumber}`;
    }
    return company?.name ? `Message from ${company.name}` : 'Message';
  };

  const openEmail = () => {
    const to = resolvedToEmail();
    if (!to) {
      toast.error('This customer has no email address');
      return;
    }
    setEmailTo(to);
    setEmailSubject(defaultEmailSubject());
    setEmailBody('');
    setAttachInvoice(false);
    setAttachEstimate(false);
    setAttachInvoiceId(relatedInvoices[0]?.id || '');
    setAttachEstimateId(relatedEstimates[0]?.id || filter.estimateId || '');
    setShowEmail(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setBusy(true);
    try {
      await api.communications.sendEmail({
        subject: emailSubject.trim(),
        message: emailBody.trim(),
        toEmail: emailTo.trim() || undefined,
        customerId: resolveCustomerId(),
        jobId: filter.jobId,
        estimateId: filter.estimateId,
        invoiceId: attachInvoice && attachInvoiceId ? attachInvoiceId : undefined,
        attachEstimateId: attachEstimate && attachEstimateId ? attachEstimateId : undefined,
      });
      await qc.invalidateQueries({ queryKey: ['communications'] });
      toast.success('Email sent');
      setEmailBody('');
      setShowEmail(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not send email. Check company SMTP settings.');
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (c: Communication) => {
    const Icon = typeIcon[c.type];
    const isOutbound = c.direction === 'outbound';
    const dirIcon = c.type === 'call' || c.type === 'voicemail'
      ? (c.status === 'missed' ? PhoneMissed : isOutbound ? PhoneOutgoing : PhoneIncoming)
      : isOutbound ? ArrowUpRight : ArrowDownLeft;
    const DirIcon = dirIcon;
    const statusColor =
      c.status === 'missed' || c.status === 'failed' || c.status === 'no_answer'
        ? 'text-destructive'
        : c.status === 'completed' || c.status === 'delivered' || c.status === 'received' || c.status === 'sent'
        ? 'text-success'
        : 'text-muted-foreground';

    return (
      <div
        key={c.id}
        onClick={() => !c.read && markCommunicationRead(c.id)}
        className={`flex gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
          c.read ? 'bg-card hover:bg-muted/40' : 'bg-primary/5 border-primary/30 hover:bg-primary/10'
        }`}
      >
        <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
            c.type === 'call' ? 'tint-success' :
            c.type === 'voicemail' ? 'tint-purple' :
            'tint-info'
          }`}>
            <Icon className="w-4 h-4" />
          </div>
          <DirIcon className={`w-3 h-3 ${statusColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium capitalize">
                {c.type === 'sms' ? 'Text' : c.type} · {isOutbound ? 'Outbound' : 'Inbound'}
              </span>
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                {c.status.replace('_', ' ')}
              </Badge>
              {!c.read && <span className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{formatTime(c.timestamp)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOutbound ? `To ${c.toNumber}` : `From ${c.fromNumber}`}
            {c.userName && ` · ${c.userName}`}
            {c.type === 'call' && c.durationSec ? ` · ${formatDuration(c.durationSec)}` : ''}
          </p>
          {c.body && (
            <p className={`text-sm mt-1.5 ${c.type === 'voicemail' ? 'italic' : ''}`}>
              {c.type === 'voicemail' && '🎙️ '}
              {c.body}
            </p>
          )}
          {c.type === 'voicemail' && (
            <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); toast.info('Voicemail playback is not available yet'); }}>
              <Play className="w-3 h-3" /> Play recording
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className={`font-heading font-bold ${compact ? 'text-base' : 'text-lg'}`}>{title}</h3>
            {unreadCount > 0 && <Badge className="text-[10px]">{unreadCount} unread</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setShowCall(true)}>
              <Phone className="w-3.5 h-3.5" /> Call
            </Button>
            <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5 h-8" onClick={() => setShowSms(true)}>
              <MessageSquare className="w-3.5 h-3.5" /> Text
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={openEmail}>
              <Mail className="w-3.5 h-3.5" /> Email
            </Button>
          </div>
        </div>

        {!compact && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            {(['all', 'call', 'sms', 'email', 'voicemail'] as const).map(t => (
              <Button
                key={t}
                size="sm"
                variant={typeFilter === t ? 'default' : 'outline'}
                className="h-7 text-xs capitalize"
                onClick={() => setTypeFilter(t)}
              >
                {t === 'sms' ? 'Texts' : t === 'all' ? 'All' : t === 'email' ? 'Email' : `${t}s`}
              </Button>
            ))}
          </div>
        )}

        {thread.length === 0 ? (
          <div className="text-center py-10 border rounded-lg border-dashed">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No communications yet</p>
            <p className="text-xs text-muted-foreground mt-1">Calls, texts, and voicemails will appear here</p>
          </div>
        ) : compact ? (
          <div className="space-y-2">{thread.map(renderRow)}</div>
        ) : (
          <ScrollArea className="h-[480px] pr-3">
            <div className="space-y-2">{thread.map(renderRow)}</div>
          </ScrollArea>
        )}
      </div>

      {/* Call Dialog */}
      <Dialog open={showCall} onOpenChange={setShowCall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" /> Call
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="text-2xl font-heading font-bold mt-1">{toNumber}</p>
            </div>
            <div>
              <Label>Call notes</Label>
              <Textarea rows={3} value={callNotes} onChange={e => setCallNotes(e.target.value)} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCall(false)}>Cancel</Button>
            <Button onClick={handleLogCall} disabled={busy} className="gap-2 gradient-primary text-primary-foreground">
              <Phone className="w-4 h-4" /> {busy ? 'Saving…' : 'Call'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={showSms} onOpenChange={setShowSms}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Send Text Message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">To:</span> {toNumber} ·{' '}
              <span className="font-medium text-foreground">From:</span> {companyLine}
            </div>
            <Textarea
              rows={5}
              value={smsBody}
              onChange={e => setSmsBody(e.target.value)}
              placeholder="Type your message..."
              maxLength={1600}
            />
            <p className="text-xs text-muted-foreground text-right">{smsBody.length}/1600</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSms(false)}>Cancel</Button>
            <Button onClick={handleSendSms} className="gap-2 gradient-primary text-primary-foreground" disabled={!smsBody.trim() || busy}>
              <MessageSquare className="w-4 h-4" /> {busy ? 'Sending…' : 'Send via Twilio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4" /> Send Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>To</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Subject"
                maxLength={200}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                rows={6}
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                placeholder="Type your message..."
                maxLength={10000}
              />
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Attachments (optional)</p>
              <p className="text-xs text-muted-foreground">Leave unchecked to send the email without PDFs.</p>
              <div className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={attachInvoice}
                  disabled={!relatedInvoices.length}
                  onCheckedChange={(v) => {
                    setAttachInvoice(v === true);
                    if (v === true && !attachInvoiceId && relatedInvoices[0]) setAttachInvoiceId(relatedInvoices[0].id);
                  }}
                />
                <span className="flex-1 min-w-0 space-y-1.5">
                  <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Attach invoice PDF</span>
                  {relatedInvoices.length === 0 ? (
                    <span className="block text-xs text-muted-foreground">No invoices for this customer</span>
                  ) : relatedInvoices.length === 1 ? (
                    <span className="block text-xs text-muted-foreground">{relatedInvoices[0].invoiceNumber}</span>
                  ) : (
                    <Select value={attachInvoiceId} onValueChange={setAttachInvoiceId} disabled={!attachInvoice}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Choose invoice" /></SelectTrigger>
                      <SelectContent>
                        {relatedInvoices.map((inv: any) => (
                          <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={attachEstimate}
                  disabled={!relatedEstimates.length}
                  onCheckedChange={(v) => {
                    setAttachEstimate(v === true);
                    if (v === true && !attachEstimateId && relatedEstimates[0]) setAttachEstimateId(relatedEstimates[0].id);
                  }}
                />
                <span className="flex-1 min-w-0 space-y-1.5">
                  <span className="flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" /> Attach estimate PDF</span>
                  {relatedEstimates.length === 0 ? (
                    <span className="block text-xs text-muted-foreground">No estimates for this customer</span>
                  ) : relatedEstimates.length === 1 ? (
                    <span className="block text-xs text-muted-foreground">{relatedEstimates[0].estimateNumber}</span>
                  ) : (
                    <Select value={attachEstimateId} onValueChange={setAttachEstimateId} disabled={!attachEstimate}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Choose estimate" /></SelectTrigger>
                      <SelectContent>
                        {relatedEstimates.map((est) => (
                          <SelectItem key={est.id} value={est.id}>{est.estimateNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmail(false)}>Cancel</Button>
            <Button
              onClick={handleSendEmail}
              className="gap-2 gradient-primary text-primary-foreground"
              disabled={!emailSubject.trim() || !emailBody.trim() || !emailTo.trim() || busy}
            >
              <Mail className="w-4 h-4" /> {busy ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CommunicationsThread;
