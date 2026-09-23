import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { BillingSettings } from '@/pages/admin/BillingSettings';
import { applyErrors, emailError, phoneError, requiredText, taxRateError, urlError } from '@/lib/formValidation';

const DEFAULT_INVOICE_SETTINGS = {
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showWebsite: true,
  showCustomerAddress: true,
  showDueDate: true,
  showStatus: true,
  showTax: true,
  showFooter: true,
  showBankDetails: false,
  showNotes: true,
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankRoutingNumber: '',
  bankIban: '',
  bankSwift: '',
  paymentInstructions: '',
};

type InvoiceSettingsState = typeof DEFAULT_INVOICE_SETTINGS;

const INVOICE_TOGGLES: { key: keyof InvoiceSettingsState; label: string }[] = [
  { key: 'showLogo', label: 'Logo' },
  { key: 'showAddress', label: 'Company address' },
  { key: 'showPhone', label: 'Phone' },
  { key: 'showEmail', label: 'Email' },
  { key: 'showWebsite', label: 'Website' },
  { key: 'showCustomerAddress', label: 'Customer address' },
  { key: 'showDueDate', label: 'Due date / valid until' },
  { key: 'showStatus', label: 'Status' },
  { key: 'showTax', label: 'Tax line' },
  { key: 'showFooter', label: 'Footer' },
  { key: 'showBankDetails', label: 'Bank / payment details' },
  { key: 'showNotes', label: 'Notes (estimates)' },
];

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
  const [prefs, setPrefs] = useState({ notifyEmailAssignments: true, notifyEmailInvoices: true, notifyEmailBilling: true });
  const [invite, setInvite] = useState({ email: '', name: '', role: 'office' });
  const [smtp, setSmtp] = useState({ host: '', port: 587, user: '', password: '', secure: true, fromName: '', fromEmail: '', replyTo: '' });
  const [editMember, setEditMember] = useState<any>(null);
  const [companyErrors, setCompanyErrors] = useState<Record<string, string>>({});
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [smtpErrors, setSmtpErrors] = useState<Record<string, string>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettingsState>(DEFAULT_INVOICE_SETTINGS);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadLogoPreview = async (fileId?: string | null) => {
    if (!fileId) {
      setLogoSrc(null);
      return;
    }
    try {
      const signed = await api.files.signedUrl(fileId);
      setLogoSrc(api.files.downloadUrl(fileId, signed.token));
    } catch {
      setLogoSrc(null);
    }
  };

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
      setInvoiceSettings({ ...DEFAULT_INVOICE_SETTINGS, ...(c.invoiceSettings || {}) });
      await loadLogoPreview(c.logoFileId);
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
        businessType: company.businessType ? company.businessType : undefined,
      });
      await hydrate();
      toast.success('Company profile saved');
    } catch (err: any) { toast.error(err?.message || 'Save failed'); }
    finally { setSavingCompany(false); }
  };

  const saveInvoiceSettings = async () => {
    setSavingInvoice(true);
    try {
      await api.company.update({
        invoiceFooter: company?.invoiceFooter ?? '',
        invoiceSettings,
      });
      toast.success('Invoice settings saved');
    } catch (err: any) { toast.error(err?.message || 'Save failed'); }
    finally { setSavingInvoice(false); }
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Use a PNG or JPG logo');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2 MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const uploaded = await api.files.upload(file);
      await api.company.update({ logoFileId: uploaded.id });
      setCompany((prev: any) => ({ ...prev, logoFileId: uploaded.id }));
      await loadLogoPreview(uploaded.id);
      toast.success('Logo uploaded');
    } catch (err: any) {
      toast.error(err?.message || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setUploadingLogo(true);
    try {
      await api.company.update({ logoFileId: null });
      setCompany((prev: any) => ({ ...prev, logoFileId: null }));
      setLogoSrc(null);
      toast.success('Logo removed');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove logo');
    } finally {
      setUploadingLogo(false);
    }
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

        <TabsContent value="company" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Company profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {company && (
                <>
                  <div className="space-y-1">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {logoSrc
                          ? <img src={logoSrc} alt="Company logo" className="h-full w-full object-contain" />
                          : <span className="text-[10px] text-muted-foreground">No logo</span>}
                      </div>
                      <div className="space-y-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => { void uploadLogo(e.target.files?.[0]); }}
                        />
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                            {uploadingLogo ? 'Uploading…' : 'Upload'}
                          </Button>
                          {company.logoFileId && (
                            <Button type="button" variant="ghost" size="sm" disabled={uploadingLogo} onClick={() => { void removeLogo(); }}>
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB. Shown on invoices and estimates when enabled below.</p>
                      </div>
                    </div>
                  </div>
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
                  <Button onClick={saveCompany} disabled={savingCompany} className="gradient-primary text-primary-foreground">{savingCompany ? 'Saving…' : 'Save'}</Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invoice settings</CardTitle>
              <CardDescription>Choose what appears on invoice and estimate PDFs emailed to customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-x-8">
                {INVOICE_TOGGLES.map((t) => (
                  <label key={t.key} className="flex items-center justify-between gap-3 py-1.5 text-sm border-b">
                    <span>{t.label}</span>
                    <Switch
                      checked={Boolean(invoiceSettings[t.key])}
                      onCheckedChange={(v) => setInvoiceSettings({ ...invoiceSettings, [t.key]: v === true })}
                    />
                  </label>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Bank details</p>
                <p className="text-xs text-muted-foreground">Shown on the PDF only when “Bank / payment details” is on.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Bank name</Label><Input value={invoiceSettings.bankName} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankName: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Account name</Label><Input value={invoiceSettings.bankAccountName} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankAccountName: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Account number</Label><Input value={invoiceSettings.bankAccountNumber} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankAccountNumber: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Routing number</Label><Input value={invoiceSettings.bankRoutingNumber} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankRoutingNumber: e.target.value })} /></div>
                  <div className="space-y-1"><Label>IBAN</Label><Input value={invoiceSettings.bankIban} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankIban: e.target.value })} /></div>
                  <div className="space-y-1"><Label>SWIFT / BIC</Label><Input value={invoiceSettings.bankSwift} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, bankSwift: e.target.value })} /></div>
                </div>
                <div className="space-y-1">
                  <Label>Payment instructions</Label>
                  <Textarea value={invoiceSettings.paymentInstructions} onChange={(e) => setInvoiceSettings({ ...invoiceSettings, paymentInstructions: e.target.value })} placeholder="e.g. Please pay within 14 days." />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Invoice footer</Label>
                <Textarea value={company?.invoiceFooter || ''} onChange={(e) => setCompany({ ...company, invoiceFooter: e.target.value })} placeholder="Thank you for your business." />
              </div>
              <Button onClick={() => { void saveInvoiceSettings(); }} disabled={savingInvoice || !company} className="gradient-primary text-primary-foreground">
                {savingInvoice ? 'Saving…' : 'Save invoice settings'}
              </Button>
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
              <p className="text-xs text-muted-foreground">Note: Render free web services block outbound SMTP (ports 25/465/587). Company email test/send needs a paid Render instance (or an HTTPS mail API). Local backend can still reach One.com SMTP.</p>
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

        <TabsContent value="billing" className="mt-4">
          <BillingSettings />
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
