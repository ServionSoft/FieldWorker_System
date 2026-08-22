import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, emailError, phoneError, requiredText, urlError } from '@/lib/formValidation';
import { FieldProWordmark } from '@/components/brand/FieldProMark';
import { toast } from 'sonner';
import { ArrowRight, Check, Wrench, Zap, Wind, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'UTC',
];

const BUSINESS = [
  { id: 'plumbing', label: 'Plumbing', icon: Wrench },
  { id: 'electrical', label: 'Electrical', icon: Zap },
  { id: 'hvac', label: 'HVAC', icon: Wind },
  { id: 'general', label: 'General / Other', icon: LayoutGrid },
] as const;

const STEPS = [
  { id: 1, label: 'Company', required: true },
  { id: 2, label: 'Business', required: false },
  { id: 3, label: 'Email', required: false },
  { id: 4, label: 'Team', required: false },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const hydrate = useAppStore((s) => s.hydrate);
  const currentUser = useAppStore((s) => s.currentUser);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [company, setCompany] = useState({
    name: '', email: '', phone: '', address: '', website: '', timezone: 'America/Chicago', businessType: '' as string,
  });
  const [smtp, setSmtp] = useState({
    host: '', port: 587, user: '', password: '', secure: true, fromName: '', fromEmail: '', replyTo: '',
  });
  const [invite, setInvite] = useState({ name: '', email: '', role: 'office' });
  const [sentInvites, setSentInvites] = useState<{ email: string; role: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty && step < 5);

  const markDirty = () => setDirty(true);

  useEffect(() => {
    const sessionCompany = useAppStore.getState().company;
    if (sessionCompany && !sessionCompany.onboardingRequired && sessionCompany.onboardingComplete) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await api.company.get();
        if (cancelled) return;
        setCompany({
          name: c.name || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          website: c.website || '',
          timezone: c.timezone || 'America/Chicago',
          businessType: c.businessType || '',
        });
        setSmtp({
          host: c.smtp?.host || '',
          port: c.smtp?.port || 587,
          user: c.smtp?.user || '',
          password: '',
          secure: c.smtp?.secure ?? true,
          fromName: c.smtp?.fromName || '',
          fromEmail: c.smtp?.fromEmail || '',
          replyTo: c.smtp?.replyTo || '',
        });
        if (c.onboardingRequired) setStep(1);
        else if (!c.onboardingComplete) setStep(c.businessType ? 3 : 2);
      } catch {
        toast.error('Could not load company profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const finish = async () => {
    try {
      await api.company.completeOnboarding();
      await hydrate();
      setDirty(false);
      setStep(5);
    } catch (err: any) {
      toast.error(err?.message || 'Could not finish setup');
    }
  };

  const saveCompany = async () => {
    const next = applyErrors({
      name: requiredText(company.name, 'Company name'),
      email: emailError(company.email, { required: true }),
      phone: phoneError(company.phone, { required: true }),
      address: requiredText(company.address, 'Address'),
      timezone: requiredText(company.timezone, 'Timezone'),
      website: urlError(company.website),
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      await api.company.update({
        name: company.name.trim(),
        email: company.email.trim(),
        phone: company.phone.trim(),
        address: company.address.trim(),
        timezone: company.timezone,
        website: company.website.trim(),
      });
      await hydrate();
      setStep(2);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save company');
    } finally {
      setSaving(false);
    }
  };

  const saveBusiness = async (type?: string) => {
    const value = type ?? company.businessType;
    if (value) {
      setSaving(true);
      try {
        await api.company.update({ businessType: value });
        setCompany((c) => ({ ...c, businessType: value }));
      } catch (err: any) {
        toast.error(err?.message || 'Could not save business type');
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setStep(3);
  };

  const saveSmtp = async () => {
    const next = applyErrors({
      host: requiredText(smtp.host, 'SMTP host'),
      fromEmail: emailError(smtp.fromEmail, { required: true }),
      replyTo: smtp.replyTo ? emailError(smtp.replyTo) : '',
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      await api.company.updateSmtp({ ...smtp, port: Number(smtp.port) || 587 });
      await api.company.testSmtp();
      toast.success('Company email saved and test sent');
      setStep(4);
    } catch (err: any) {
      toast.error(err?.message || 'SMTP save or test failed');
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    const next = applyErrors({
      inviteName: requiredText(invite.name, 'Name'),
      inviteEmail: emailError(invite.email, { required: true }),
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      const r = await api.members.invite({ name: invite.name.trim(), email: invite.email.trim(), role: invite.role });
      toast.success(r.inviteUrl ? `Invite sent. ${r.inviteUrl}` : 'Invite sent');
      setSentInvites((rows) => [...rows, { email: invite.email.trim(), role: invite.role }]);
      setInvite({ name: '', email: '', role: 'office' });
    } catch (err: any) {
      toast.error(err?.message || 'Invite failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-dvh bg-[#F8FAFC]" />;
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <button type="button" onClick={() => navigate('/')} className="mb-8" aria-label="FieldPro home">
          <FieldProWordmark />
        </button>

        {step < 5 && (
          <div className="mb-8">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                    step > s.id ? 'bg-primary text-primary-foreground' : step === s.id ? 'bg-primary text-primary-foreground' : 'bg-white border border-border text-muted-foreground',
                  )}>
                    {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={cn('text-xs font-medium truncate hidden sm:inline', step === s.id ? 'text-foreground' : 'text-muted-foreground')}>
                    {s.label}{s.required ? '' : ''}
                  </span>
                  {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border hidden sm:block" />}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {step === 1 ? 'Required' : 'Optional — you can skip and set this up later in Settings'}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-[10px] border border-border bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="font-heading text-xl font-semibold text-foreground">Company information</h1>
              <p className="text-sm text-muted-foreground mt-1">This is required before you can use FieldPro.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="onboard-name">Company name</Label>
                <Input id="onboard-name" aria-label="Company name" value={company.name} onChange={(e) => { markDirty(); setCompany({ ...company, name: e.target.value }); }} {...fieldInvalidProps('name', errors.name)} />
                <FieldError id="name-error" message={errors.name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboard-email">Company email</Label>
                <Input id="onboard-email" aria-label="Company email" type="email" value={company.email} onChange={(e) => { markDirty(); setCompany({ ...company, email: e.target.value }); }} {...fieldInvalidProps('email', errors.email)} />
                <FieldError id="email-error" message={errors.email} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboard-phone">Phone</Label>
                <Input id="onboard-phone" aria-label="Phone" value={company.phone} onChange={(e) => { markDirty(); setCompany({ ...company, phone: e.target.value }); }} {...fieldInvalidProps('phone', errors.phone)} />
                <FieldError id="phone-error" message={errors.phone} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="onboard-address">Address</Label>
                <Input id="onboard-address" aria-label="Address" value={company.address} onChange={(e) => { markDirty(); setCompany({ ...company, address: e.target.value }); }} {...fieldInvalidProps('address', errors.address)} />
                <FieldError id="address-error" message={errors.address} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboard-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="onboard-website" aria-label="Website" placeholder="https://" value={company.website} onChange={(e) => { markDirty(); setCompany({ ...company, website: e.target.value }); }} {...fieldInvalidProps('website', errors.website)} />
                <FieldError id="website-error" message={errors.website} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboard-timezone">Timezone</Label>
                <Select value={company.timezone} onValueChange={(v) => { markDirty(); setCompany({ ...company, timezone: v }); }}>
                  <SelectTrigger id="onboard-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full h-11" disabled={saving} onClick={saveCompany}>
              {saving ? 'Saving…' : <span className="flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></span>}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-[10px] border border-border bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="font-heading text-xl font-semibold">What type of business do you operate?</h1>
              <p className="text-sm text-muted-foreground mt-1">Optional. Helps tailor FieldPro to your trade.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BUSINESS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => saveBusiness(b.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-[10px] border px-3 py-3 text-left min-h-11 hover:border-primary/40 hover:bg-primary-light/60',
                    company.businessType === b.id ? 'border-primary bg-primary-light' : 'border-border bg-white',
                  )}
                >
                  <b.icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">{b.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(3)}>
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-[10px] border border-border bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="font-heading text-xl font-semibold">Company email (SMTP)</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Used for invoices, estimates, appointments, and customer follow-ups.
                Password reset, invites, and billing use FieldPro platform email.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="smtp-host">SMTP host</Label>
                <Input id="smtp-host" aria-label="SMTP host" value={smtp.host} onChange={(e) => { markDirty(); setSmtp({ ...smtp, host: e.target.value }); }} {...fieldInvalidProps('host', errors.host)} />
                <FieldError id="host-error" message={errors.host} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" aria-label="Port" type="number" value={smtp.port} onChange={(e) => { markDirty(); setSmtp({ ...smtp, port: Number(e.target.value) }); }} />
              </div>
              <div className="space-y-1.5">
                <Label>TLS / encryption</Label>
                <Select value={smtp.secure ? 'tls' : 'none'} onValueChange={(v) => setSmtp({ ...smtp, secure: v === 'tls' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">TLS / STARTTLS</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input id="smtp-user" aria-label="Username" value={smtp.user} onChange={(e) => { markDirty(); setSmtp({ ...smtp, user: e.target.value }); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-password">Password</Label>
                <Input id="smtp-password" aria-label="Password" type="password" value={smtp.password} onChange={(e) => { markDirty(); setSmtp({ ...smtp, password: e.target.value }); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-name">From name</Label>
                <Input id="smtp-from-name" aria-label="From name" value={smtp.fromName} onChange={(e) => { markDirty(); setSmtp({ ...smtp, fromName: e.target.value }); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-email">From email</Label>
                <Input id="smtp-from-email" aria-label="From email" type="email" value={smtp.fromEmail} onChange={(e) => { markDirty(); setSmtp({ ...smtp, fromEmail: e.target.value }); }} {...fieldInvalidProps('fromEmail', errors.fromEmail)} />
                <FieldError id="fromEmail-error" message={errors.fromEmail} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="smtp-reply-to">Reply-To</Label>
                <Input id="smtp-reply-to" aria-label="Reply-To" type="email" value={smtp.replyTo} onChange={(e) => { markDirty(); setSmtp({ ...smtp, replyTo: e.target.value }); }} {...fieldInvalidProps('replyTo', errors.replyTo)} />
                <FieldError id="replyTo-error" message={errors.replyTo} />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="h-11 flex-1" disabled={saving} onClick={saveSmtp}>
                {saving ? 'Saving…' : 'Save & Test Email'}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setStep(4)}>Skip for now</Button>
            </div>
            <p className="text-xs text-muted-foreground">You can configure this later under Settings → Company email.</p>
          </div>
        )}

        {step === 4 && (
          <div className="rounded-[10px] border border-border bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="font-heading text-xl font-semibold">Invite your team</h1>
              <p className="text-sm text-muted-foreground mt-1">Optional. Field worker invites count toward your plan’s worker seats.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" aria-label="Name" value={invite.name} onChange={(e) => { markDirty(); setInvite({ ...invite, name: e.target.value }); }} {...fieldInvalidProps('inviteName', errors.inviteName)} />
                <FieldError id="inviteName-error" message={errors.inviteName} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" aria-label="Email" type="email" value={invite.email} onChange={(e) => { markDirty(); setInvite({ ...invite, email: e.target.value }); }} {...fieldInvalidProps('inviteEmail', errors.inviteEmail)} />
                <FieldError id="inviteEmail-error" message={errors.inviteEmail} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                  <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="field_worker">Field Worker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={saving} onClick={sendInvite}>
              {saving ? 'Sending…' : 'Send invite'}
            </Button>
            {sentInvites.length > 0 && (
              <ul className="text-sm text-muted-foreground space-y-1">
                {sentInvites.map((i) => (
                  <li key={i.email}>Invited {i.email} as {i.role.replace('_', ' ')}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button className="h-11 flex-1" onClick={finish}>Continue</Button>
              <Button variant="outline" className="h-11" onClick={finish}>Skip for now</Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="rounded-[10px] border border-border bg-white p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary-light text-primary flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <h1 className="font-heading text-2xl font-semibold">You’re ready to start using FieldPro.</h1>
            <p className="text-sm text-muted-foreground">
              Optional setup like SMTP and team invites stays available in Settings.
            </p>
            <Button className="h-11 w-full sm:w-auto px-8" onClick={() => navigate('/admin')}>
              Go to Dashboard
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Signed in as {currentUser?.email}
        </p>
      </div>
    </div>
  );
}
