import { useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setTokens } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { emailError, phoneError, requiredText } from '@/lib/formValidation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/profile/UserAvatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
  'America/Toronto', 'Europe/London',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type FormState = {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  timezone: string;
  locale: string;
  notifyEmailAssignments: boolean;
  notifyEmailInvoices: boolean;
  notifyEmailBilling: boolean;
};

function passwordIssues(pw: string) {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('At least 8 characters');
  if (!/[A-Za-z]/.test(pw)) issues.push('At least one letter');
  if (!/[0-9]/.test(pw)) issues.push('At least one number');
  return issues;
}

const ProfilePage = () => {
  const hydrate = useAppStore((s) => s.hydrate);
  const currentUser = useAppStore((s) => s.currentUser);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile'], queryFn: api.profile.get });
  const data = q.data;

  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: FormState = {
      firstName: data.user.firstName || '',
      lastName: data.user.lastName || '',
      name: data.user.name || '',
      email: data.user.email || '',
      phone: data.user.phone || '',
      jobTitle: data.user.jobTitle || '',
      timezone: data.user.timezone || 'America/Chicago',
      locale: data.user.locale || 'en',
      notifyEmailAssignments: data.preferences?.notifyEmailAssignments ?? true,
      notifyEmailInvoices: data.preferences?.notifyEmailInvoices ?? true,
      notifyEmailBilling: data.preferences?.notifyEmailBilling ?? true,
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
  }, [data]);

  const dirty = !!form && JSON.stringify(form) !== baseline;
  const blocker = useBlocker(dirty);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const pwNextIssues = useMemo(() => passwordIssues(pw.next), [pw.next]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const save = async () => {
    if (!form) return;
    const nameErr = requiredText(form.firstName || form.name, 'Name');
    const mailErr = emailError(form.email, { required: true });
    const phErr = phoneError(form.phone);
    if (nameErr || mailErr || phErr) {
      toast.error(nameErr || mailErr || phErr);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        name: form.name,
        email: form.email,
        phone: form.phone,
        jobTitle: form.jobTitle,
        timezone: form.timezone,
        locale: form.locale,
      };
      if (data?.preferences) {
        body.notifyEmailAssignments = form.notifyEmailAssignments;
        body.notifyEmailInvoices = form.notifyEmailInvoices;
        body.notifyEmailBilling = form.notifyEmailBilling;
      }
      const updated = await api.profile.update(body);
      qc.setQueryData(['profile'], updated);
      await hydrate();
      toast.success('Profile saved');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!data || !form) return;
    const next: FormState = JSON.parse(baseline);
    setForm(next);
  };

  const changePassword = async () => {
    if (pw.next !== pw.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (pwNextIssues.length) {
      toast.error(pwNextIssues.join('. '));
      return;
    }
    setPwSaving(true);
    try {
      const tokens = await api.profile.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setTokens(tokens.accessToken, tokens.refreshToken);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password updated');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setPwSaving(false);
    }
  };

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2 MB or smaller');
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      toast.error('Use a JPEG, PNG, WebP, or GIF image');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      const updated = await api.profile.uploadAvatar(file);
      qc.setQueryData(['profile'], updated);
      await hydrate();
      toast.success('Photo updated');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      URL.revokeObjectURL(url);
      setPreview(null);
    }
  };

  const removeAvatar = async () => {
    try {
      const updated = await api.profile.removeAvatar();
      qc.setQueryData(['profile'], updated);
      await hydrate();
      toast.success('Photo removed');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove photo');
    }
  };

  if (q.isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  if (q.isError) {
    return <p className="text-sm text-destructive">Could not load your profile.</p>;
  }

  const account = data.account;
  const isSa = account.isPlatformAdmin || currentUser?.role === 'super_admin';
  const roleLabel = String(account.role).replace('_', ' ');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-bold">My Profile</h1>
        <p className="text-sm text-muted-foreground">Your personal account. Company users and roles are managed in Settings.</p>
      </div>

      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row gap-5 items-start">
          <div className="flex items-center gap-4">
            {preview ? (
              <img src={preview} alt="" className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <UserAvatar size="lg" name={form.name} hasAvatar={data.user.hasAvatar} />
            )}
            <div className="space-y-2">
              <p className="font-heading font-semibold">{form.name}</p>
              <p className="font-data text-xs text-muted-foreground">{form.email}</p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void onPickAvatar(e.target.files?.[0])} />
                  <span className="inline-flex items-center h-9 px-3 rounded-lg border border-input bg-background text-sm font-heading cursor-pointer hover:bg-accent">
                    {data.user.hasAvatar ? 'Replace photo' : 'Upload photo'}
                  </span>
                </label>
                {data.user.hasAvatar && (
                  <Button type="button" variant="outline" onClick={() => void removeAvatar()}>Remove</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">JPEG, PNG, WebP, or GIF · 2 MB max</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg font-heading">Personal information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={form.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job title</Label>
            <Input id="jobTitle" value={form.jobTitle} onChange={(e) => setField('jobTitle', e.target.value)} placeholder={isSa ? 'Platform administrator' : 'Optional'} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => setField('timezone', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([form.timezone, ...TIMEZONES])).map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Preferred language</Label>
              <Select value={form.locale} onValueChange={(v) => setField('locale', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>Cancel</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg font-heading">Change password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {([
            ['current', 'Current password'],
            ['next', 'New password'],
            ['confirm', 'Confirm new password'],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="relative">
                <Input
                  type={showPw[key] ? 'text' : 'password'}
                  value={pw[key === 'current' ? 'current' : key === 'next' ? 'next' : 'confirm']}
                  onChange={(e) => setPw((p) => ({
                    ...p,
                    [key === 'current' ? 'current' : key === 'next' ? 'next' : 'confirm']: e.target.value,
                  }))}
                  className="pr-10"
                  autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPw((s) => ({ ...s, [key]: !s[key] }))}
                  aria-label="Toggle password"
                >
                  {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          <ul className="text-xs text-muted-foreground space-y-1">
            {['At least 8 characters', 'At least one letter', 'At least one number'].map((rule) => {
              const ok = !passwordIssues(pw.next).includes(rule) && pw.next.length > 0;
              return <li key={rule} className={ok ? 'text-success' : ''}>{ok ? '✓' : '·'} {rule}</li>;
            })}
            {pw.confirm.length > 0 && pw.next !== pw.confirm && (
              <li className="text-destructive">New passwords must match</li>
            )}
          </ul>
          <Button onClick={() => void changePassword()} disabled={pwSaving || !pw.current || !pw.next}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </Button>
        </CardContent>
      </Card>

      {data.preferences && (
        <Card>
          <CardHeader><CardTitle className="text-lg font-heading">Notification preferences</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {([
              ['notifyEmailAssignments', 'Job assignments'],
              ['notifyEmailInvoices', 'Customer invoices'],
              ['notifyEmailBilling', 'Subscription billing'],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form[k]} onCheckedChange={(v) => setField(k, !!v)} />
                {label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">These are the same email preferences stored on your company membership.</p>
          </CardContent>
        </Card>
      )}

      {data.worker && (
        <Card>
          <CardHeader><CardTitle className="text-lg font-heading">Field profile</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Employment status</span>
              <Badge variant="secondary">{data.worker.employmentStatus.replace('_', ' ')}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground mb-1.5">Specialties</p>
              <div className="flex flex-wrap gap-1.5">
                {(data.worker.specialties as string[]).length === 0 && <span>None listed</span>}
                {(data.worker.specialties as string[]).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jobs completed</span>
              <span className="font-data">{data.worker.jobsCompleted}</span>
            </div>
            <div>
              <p className="text-muted-foreground mb-1.5">Availability</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-data text-xs">
                {DAYS.map((d) => {
                  const slot = data.worker.availability?.[d];
                  return (
                    <div key={d} className="flex justify-between gap-2">
                      <span className="capitalize">{d.slice(0, 3)}</span>
                      <span>{slot ? `${slot.start}–${slot.end}` : 'Off'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Status, specialties, and schedule are set by your office. Contact an admin to change them.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg font-heading">Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isSa ? (
            <>
              <Row label="Account" value="FieldPro platform" />
              <Row label="Role" value="Super admin" />
            </>
          ) : (
            <>
              <Row label="Company" value={account.companyName || '—'} />
              <Row label="Role" value={roleLabel} />
            </>
          )}
          <Row label="Account status" value={account.status} />
          <Row label="Member since" value={data.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : '—'} mono />
          <Row label="Last sign-in" value={data.user.lastLoginAt ? new Date(data.user.lastLoginAt).toLocaleString() : '—'} mono />
        </CardContent>
      </Card>

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>Leave without saving your profile edits?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-data text-right' : 'text-right capitalize'}>{value}</span>
    </div>
  );
}

export default ProfilePage;
