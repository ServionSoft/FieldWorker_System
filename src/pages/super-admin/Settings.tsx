import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function PlatformSettings() {
  const [form, setForm] = useState({
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '', smtpSecure: true,
    smtpFromName: '', smtpFromEmail: '', smtpReplyTo: '', trialDays: 14, supportEmail: '', stripeConfigured: false,
  });
  const [templates, setTemplates] = useState<{ type: string; name: string; subject: string; body: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingTpl, setSavingTpl] = useState<string | null>(null);

  const load = () => {
    api.platform.settings().then((s) => setForm({
      smtpHost: s.smtp.host, smtpPort: s.smtp.port, smtpUser: s.smtp.user, smtpPassword: '',
      smtpSecure: s.smtp.secure, smtpFromName: s.smtp.fromName, smtpFromEmail: s.smtp.fromEmail,
      smtpReplyTo: s.smtp.replyTo || '',
      trialDays: s.trialDays, supportEmail: s.supportEmail, stripeConfigured: s.stripeConfigured,
    })).catch((e) => toast.error(e.message));
    api.platform.emailTemplates().then(setTemplates).catch(() => undefined);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.platform.updateSettings(form);
      toast.success('Platform settings saved');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold">Platform settings</h1>
        <p className="text-sm text-muted-foreground">FieldPro system configuration. Tenant SMTP is separate and never used here.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">General</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Trial days</Label><Input type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Support email</Label><Input value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Stripe: {form.stripeConfigured ? 'configured' : 'not configured'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Platform Email</CardTitle>
          <p className="text-sm text-muted-foreground">Used for FieldPro account, authentication, security, and subscription emails. Tenants cannot change this sender.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>SMTP host</Label><Input value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} /></div>
            <div className="space-y-1"><Label>Port</Label><Input type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Username</Label><Input value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} /></div>
            <div className="space-y-1"><Label>Password</Label><Input type="password" value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} placeholder="Unchanged if blank" /></div>
            <div className="space-y-1"><Label>From name</Label><Input value={form.smtpFromName} onChange={(e) => setForm({ ...form, smtpFromName: e.target.value })} /></div>
            <div className="space-y-1"><Label>From email</Label><Input value={form.smtpFromEmail} onChange={(e) => setForm({ ...form, smtpFromEmail: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Reply-To</Label><Input value={form.smtpReplyTo} onChange={(e) => setForm({ ...form, smtpReplyTo: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.smtpSecure} onCheckedChange={(v) => setForm({ ...form, smtpSecure: !!v })} />
            Use TLS (STARTTLS on port 587, SSL on 465)
          </label>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || testing}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="outline" disabled={saving || testing} onClick={async () => {
              setTesting(true);
              try {
                await api.platform.updateSettings(form);
                await api.platform.testSmtp();
                toast.success('Platform test sent');
                load();
              } catch (e: any) { toast.error(e.message); }
              finally { setTesting(false); }
            }}>{testing ? 'Sending…' : 'Send test'}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Platform templates</CardTitle>
          <p className="text-sm text-muted-foreground">System templates only. Use placeholders like {'{name}'}, {'{companyName}'}, {'{verifyLink}'}, {'{resetUrl}'}. Tenant CRM templates live under company Email templates and cannot change these.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {templates.map((t) => (
            <div key={t.type} className="space-y-2 border-b pb-4 last:border-0">
              <p className="text-sm font-medium">{t.name} <span className="text-muted-foreground font-normal">({t.type})</span></p>
              <Input value={t.subject} onChange={(e) => setTemplates((rows) => rows.map((x) => x.type === t.type ? { ...x, subject: e.target.value } : x))} />
              <Textarea rows={4} value={t.body} onChange={(e) => setTemplates((rows) => rows.map((x) => x.type === t.type ? { ...x, body: e.target.value } : x))} />
              <Button size="sm" disabled={savingTpl === t.type} onClick={async () => {
                setSavingTpl(t.type);
                try {
                  await api.platform.updateEmailTemplate(t.type, { name: t.name, subject: t.subject, body: t.body });
                  toast.success('Template saved');
                } catch (e: any) { toast.error(e.message); }
                finally { setSavingTpl(null); }
              }}>{savingTpl === t.type ? 'Saving…' : 'Save template'}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
