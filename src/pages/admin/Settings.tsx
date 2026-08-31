import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, emailError, phoneError, requiredText, taxRateError, urlError } from '@/lib/formValidation';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  office: 'Office',
  field_worker: 'Field Worker',
};

const can = (perms: string[] | undefined, key: string) =>
  !perms || perms.includes(key);

const AdminSettings = () => {
  const currentUser = useAppStore((s) => s.currentUser);
  const hydrate = useAppStore((s) => s.hydrate);
  const perms = currentUser?.permissions;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'company';
  const setTab = (v: string) => setParams({ tab: v });

  const [company, setCompany] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<{ key: string; label: string }[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [prefs, setPrefs] = useState({ notifyEmailAssignments: true, notifyEmailInvoices: true, notifyEmailBilling: true });
  const [invite, setInvite] = useState({ email: '', name: '', role: 'office' });
  const [smtp, setSmtp] = useState({ host: '', port: 587, user: '', password: '', secure: true, fromName: '', fromEmail: '', replyTo: '' });
  const [editMember, setEditMember] = useState<any>(null);
  const [companyErrors, setCompanyErrors] = useState<Record<string, string>>({});
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [smtpErrors, setSmtpErrors] = useState<Record<string, string>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    try {
      const c = await api.company.get();
      setCompany({
        ...c,
        phone: c.phone ?? '',
        address: c.address ?? '',
        website: c.website ?? '',
        invoiceFooter: c.invoiceFooter ?? '',
        twilioNumber: c.twilioNumber ?? '',
        timezone: c.timezone ?? 'America/Chicago',
      });
      setSmtp({
        host: c.smtp?.host || '', port: c.smtp?.port || 587, user: c.smtp?.user || '', password: '',
        secure: c.smtp?.secure ?? true, fromName: c.smtp?.fromName || '', fromEmail: c.smtp?.fromEmail || '',
        replyTo: c.smtp?.replyTo || '',
      });
    } catch { /* ignore */ }
    if (can(perms, 'settings.users')) {
      try {
        const m = await api.members.list();
        setMembers(m.items);
        setCatalog(m.permissionCatalog);
        setInvites(await api.members.invitations());
      } catch { /* ignore */ }
    }
    if (can(perms, 'billing.manage')) {
      try { setBilling(await api.billing.get()); } catch { /* ignore */ }
    }
  };

  useEffect(() => { void load(); }, []);

  const saveCompany = async () => {
    const next = applyErrors({
      companyName: requiredText(company?.name, 'Company name'),
      companyEmail: emailError(company?.email, { required: true }),
      companyPhone: phoneError(company?.phone, { required: true }),
      companyAddress: requiredText(company?.address, 'Address'),
      website: urlError(company?.website),
      defaultTaxPct: taxRateError(company?.defaultTaxPct),
    });
    setCompanyErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSavingCompany(true);
    try {
      await api.company.update({
        name: String(company.name).trim(),
        email: company.email,
        phone: company.phone ?? '',
        address: company.address ?? '',
        twilioNumber: company.twilioNumber ?? '',
        timezone: company.timezone ?? '',
        defaultTaxPct: Number(company.defaultTaxPct || 0),
        website: company.website ?? '',
        invoiceFooter: company.invoiceFooter ?? '',
        businessType: company.businessType ? company.businessType : undefined,
      });
      await hydrate();
      toast.success('Company profile saved');
    } catch (err: any) { toast.error(err?.message || 'Save failed'); }
    finally { setSavingCompany(false); }
  };

  const saveSmtp = async () => {
    const next = applyErrors({
      host: requiredText(smtp.host, 'SMTP host'),
      fromEmail: emailError(smtp.fromEmail, { required: true }),
      replyTo: smtp.replyTo ? emailError(smtp.replyTo) : '',
    });
    setSmtpErrors(next);
    if (Object.values(next).some(Boolean)) return false;
    setSavingSmtp(true);
    try {
      await api.company.updateSmtp({
        ...smtp,
        host: String(smtp.host).trim(),
        port: Number(smtp.port) || 587,
        fromEmail: String(smtp.fromEmail).trim(),
        replyTo: String(smtp.replyTo || '').trim(),
      });
      toast.success('SMTP saved');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'SMTP save failed');
      return false;
    } finally {
      setSavingSmtp(false);
    }
  };

  const testSmtp = async () => {
    const next = applyErrors({
      host: requiredText(smtp.host, 'SMTP host'),
      fromEmail: emailError(smtp.fromEmail, { required: true }),
      replyTo: smtp.replyTo ? emailError(smtp.replyTo) : '',
    });
    setSmtpErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (!smtp.port) {
      toast.error('SMTP port is required before sending a test.');
      return;
    }
    setTestingSmtp(true);
    try {
      await api.company.updateSmtp({
        ...smtp,
        host: String(smtp.host).trim(),
        port: Number(smtp.port) || 587,
        fromEmail: String(smtp.fromEmail).trim(),
        replyTo: String(smtp.replyTo || '').trim(),
      });
      await api.company.testSmtp();
      toast.success('Company email test sent');
      setSmtp((s) => ({ ...s, password: '' }));
    } catch (e: any) {
      toast.error(e?.message || 'SMTP test failed');
    } finally {
      setTestingSmtp(false);
    }
  };

  const sendInvite = async () => {
    const next = applyErrors({
      inviteEmail: emailError(invite.email, { required: true }),
      inviteName: requiredText(invite.name, 'Name'),
    });
    setInviteErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setInviting(true);
    try {
      const r = await api.members.invite({ ...invite, email: invite.email.trim(), name: invite.name.trim() });
      toast.success(r.inviteUrl ? `Invite sent. ${r.inviteUrl}` : 'Invite sent');
      setInvite({ email: '', name: '', role: 'office' });
      await load();
    } catch (err: any) { toast.error(err?.message || 'Invite failed'); }
    finally { setInviting(false); }
  };

  const visibleTabs = useMemo(() => ([
    { id: 'company', label: 'Company', show: can(perms, 'settings.company') || can(perms, 'jobs.read') },
    { id: 'users', label: 'Users', show: can(perms, 'settings.users') },
    { id: 'smtp', label: 'Company email', show: can(perms, 'settings.smtp') },
    { id: 'comms', label: 'Communications', show: can(perms, 'settings.company') },
    { id: 'billing', label: 'Billing', show: can(perms, 'billing.manage') },
    { id: 'notifications', label: 'Notifications', show: true },
  ].filter((t) => t.show)), [perms]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-heading font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Company, team, email, and subscription</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          {visibleTabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Company profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {company && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="companyName">Name</Label>
                      <Input value={company.name || ''} onChange={(e) => setCompany({ ...company, name: e.target.value })} {...fieldInvalidProps('companyName', companyErrors.companyName)} />
                      <FieldError id="companyName-error" message={companyErrors.companyName} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="companyEmail">Email</Label>
                      <Input value={company.email || ''} onChange={(e) => setCompany({ ...company, email: e.target.value })} {...fieldInvalidProps('companyEmail', companyErrors.companyEmail)} />
                      <FieldError id="companyEmail-error" message={companyErrors.companyEmail} />
                    </div>
                    <div className="space-y-1">
                      <Label>Phone</Label>
                      <Input value={company.phone || ''} onChange={(e) => setCompany({ ...company, phone: e.target.value })} {...fieldInvalidProps('companyPhone', companyErrors.companyPhone)} />
                      <FieldError id="companyPhone-error" message={companyErrors.companyPhone} />
                    </div>
                    <div className="space-y-1"><Label>Timezone</Label><Input value={company.timezone || ''} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} /></div>
                    <div className="space-y-1">
                      <Label htmlFor="defaultTaxPct">Default tax %</Label>
                      <Input type="number" value={company.defaultTaxPct ?? 0} onChange={(e) => setCompany({ ...company, defaultTaxPct: e.target.value })} {...fieldInvalidProps('defaultTaxPct', companyErrors.defaultTaxPct)} />
                      <FieldError id="defaultTaxPct-error" message={companyErrors.defaultTaxPct} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="website">Website</Label>
                      <Input value={company.website || ''} onChange={(e) => setCompany({ ...company, website: e.target.value })} {...fieldInvalidProps('website', companyErrors.website)} />
                      <FieldError id="website-error" message={companyErrors.website} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Address</Label>
                    <Input value={company.address || ''} onChange={(e) => setCompany({ ...company, address: e.target.value })} {...fieldInvalidProps('companyAddress', companyErrors.companyAddress)} />
                    <FieldError id="companyAddress-error" message={companyErrors.companyAddress} />
                  </div>
                  <div className="space-y-1">
                    <Label>Business type</Label>
                    <Select value={company.businessType || 'none'} onValueChange={(v) => setCompany({ ...company, businessType: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        <SelectItem value="plumbing">Plumbing</SelectItem>
                        <SelectItem value="electrical">Electrical</SelectItem>
                        <SelectItem value="hvac">HVAC</SelectItem>
                        <SelectItem value="general">General / Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Invoice footer</Label><Input value={company.invoiceFooter || ''} onChange={(e) => setCompany({ ...company, invoiceFooter: e.target.value })} /></div>
                  <Button onClick={saveCompany} disabled={savingCompany} className="gradient-primary text-primary-foreground">{savingCompany ? 'Saving…' : 'Save'}</Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Invite teammate</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-4 gap-3">
              <div>
                <Input placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} {...fieldInvalidProps('inviteEmail', inviteErrors.inviteEmail)} />
                <FieldError id="inviteEmail-error" message={inviteErrors.inviteEmail} />
              </div>
              <div>
                <Input placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} {...fieldInvalidProps('inviteName', inviteErrors.inviteName)} />
                <FieldError id="inviteName-error" message={inviteErrors.inviteName} />
              </div>
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(currentUser?.role === 'owner' ? ['owner', 'admin', 'dispatcher', 'office', 'field_worker'] : ['admin', 'dispatcher', 'office', 'field_worker']).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={sendInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send invite'}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Team</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {members.map((m) => (
                <div key={m.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{m.name} <Badge variant="secondary" className="ml-1">{m.role}</Badge></p>
                      <p className="text-xs text-muted-foreground">{m.email} · {m.status}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditMember(editMember?.id === m.id ? null : m)}>Permissions</Button>
                      {m.status === 'active' && m.userId !== currentUser?.id && (
                        <Button size="sm" variant="ghost" onClick={async () => { await api.members.remove(m.id); toast.success('Deactivated'); load(); }}>Deactivate</Button>
                      )}
                    </div>
                  </div>
                  {editMember?.id === m.id && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Select value={m.role} disabled={m.userId === currentUser?.id} onValueChange={async (role) => { await api.members.update(m.id, { role }); load(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['owner', 'admin', 'dispatcher', 'office', 'field_worker'].map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {catalog.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={m.permissions?.includes(p.key)}
                            onCheckedChange={async (v) => {
                              const next = catalog.map((c) => ({
                                permission: c.key,
                                allowed: c.key === p.key ? !!v : !!m.permissions?.includes(c.key),
                              }));
                              await api.members.update(m.id, { permissions: next });
                              await load();
                            }}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {invites.filter((i) => i.status === 'pending').length > 0 && (
                <div className="pt-2">
                  <p className="text-sm font-medium mb-2">Pending invites</p>
                  {invites.filter((i) => i.status === 'pending').map((i) => (
                    <p key={i.id} className="text-xs text-muted-foreground">{i.email} · {i.role}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tenant Email</CardTitle>
              <p className="text-sm text-muted-foreground">Used for emails sent by your company to customers (invoices, estimates, appointments, follow-ups). FieldPro account, password reset, invites, and billing emails use FieldPro Platform Email — not these settings.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Host</Label><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></div>
                <div className="space-y-1"><Label>Port</Label><Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Username</Label><Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></div>
                <div className="space-y-1"><Label>Password</Label><Input type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder="Unchanged if blank" /></div>
                <div className="space-y-1"><Label>From name</Label><Input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label htmlFor="fromEmail">From email</Label>
                  <Input value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} {...fieldInvalidProps('fromEmail', smtpErrors.fromEmail)} />
                  <FieldError id="fromEmail-error" message={smtpErrors.fromEmail} />
                </div>
                <div className="space-y-1 sm:col-span-2"><Label>Reply-To</Label><Input value={smtp.replyTo} onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={smtp.secure} onCheckedChange={(v) => setSmtp({ ...smtp, secure: !!v })} />
                Use TLS (STARTTLS on port 587, SSL on 465)
              </label>
              <div className="flex gap-2">
                <Button onClick={() => { void saveSmtp(); }} disabled={savingSmtp || testingSmtp}>{savingSmtp ? 'Saving…' : 'Save SMTP'}</Button>
                <Button variant="outline" disabled={savingSmtp || testingSmtp} onClick={() => { void testSmtp(); }}>
                  {testingSmtp ? 'Sending…' : 'Send test'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Twilio</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>From number (E.164)</Label>
                <Input value={company?.twilioNumber || ''} onChange={(e) => setCompany({ ...company, twilioNumber: e.target.value })} placeholder="+15551234567" />
              </div>
              <p className="text-xs text-muted-foreground">SID and auth token stay in backend .env.</p>
              <Button onClick={saveCompany}>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4 space-y-4">
          {!billing ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-lg">Subscription</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">Plan: <strong>{billing.subscription?.planName}</strong> · {billing.subscription?.status}</p>
                  {billing.subscription?.trialEndsAt && <p className="text-xs text-muted-foreground">Trial ends {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}</p>}
                  {(billing.subscription?.featureKeys || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(billing.subscription.featureKeys as string[]).map((k: string) => (
                        <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                      ))}
                    </div>
                  )}
                  {!billing.stripeConfigured && <p className="text-sm text-warning">Stripe is not configured. Super Admin can assign plans manually.</p>}
                  {billing.stripeConfigured && (
                    <div className="flex flex-wrap gap-2">
                      {billing.plans?.map((p: any) => (
                        <Button key={p.id} variant="outline" size="sm" onClick={async () => {
                          try {
                            const { url } = await api.billing.checkout(p.id, 'monthly');
                            window.location.href = url;
                          } catch (e: any) { toast.error(e.message); }
                        }}>Upgrade to {p.name} (${p.price}/mo)</Button>
                      ))}
                      <Button variant="secondary" onClick={async () => {
                        try { const { url } = await api.billing.portal(); window.location.href = url; }
                        catch (e: any) { toast.error(e.message); }
                      }}>Payment methods & receipts</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Invoices</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(billing.invoices || []).length === 0 && <p className="text-sm text-muted-foreground">No subscription invoices yet.</p>}
                  {(billing.invoices || []).map((i: any) => (
                    <div key={i.id} className="flex justify-between text-sm">
                      <span>{i.number || i.id.slice(0, 8)} · {i.status}</span>
                      <span>${i.amount} {i.hostedUrl && <a className="text-primary ml-2" href={i.hostedUrl} target="_blank" rel="noreferrer">View</a>}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Email me about</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                ['notifyEmailAssignments', 'Job assignments'],
                ['notifyEmailInvoices', 'Customer invoices'],
                ['notifyEmailBilling', 'Subscription billing'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={(prefs as any)[k]} onCheckedChange={(v) => setPrefs({ ...prefs, [k]: !!v })} />
                  {label}
                </label>
              ))}
              <Button onClick={async () => { await api.auth.preferences(prefs); toast.success('Preferences saved'); }}>Save preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettings;
