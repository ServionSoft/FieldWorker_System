import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const startImpersonation = useAppStore((s) => s.startImpersonation);
  const [c, setC] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const load = () => { if (id) api.platform.getCompany(id).then(setC).catch((e) => toast.error(e.message)); };
  useEffect(() => { load(); }, [id]);

  if (!c) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">{c.email} · {c.planName} · <Badge>{c.status}</Badge></p>
        </div>
        <Button variant="outline" onClick={() => navigate('/super-admin/companies')}>Back</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Members</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(c.members || []).map((m: any) => (
            <div key={m.id} className="flex justify-between text-sm">
              <span>{m.name} · {m.email}</span><Badge variant="secondary">{m.role}</Badge>
            </div>
          ))}
          {(c.members || []).length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
          <div className="flex gap-2 pt-2">
            <Input placeholder="Owner email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <Button onClick={async () => {
              try {
                const r = await api.platform.inviteOwner(c.id, { email: inviteEmail });
                toast.success(r.inviteUrl || 'Invite sent');
                setInviteEmail('');
                load();
              } catch (e: any) { toast.error(e.message); }
            }}>Invite owner</Button>
          </div>
          <Button variant="secondary" onClick={async () => {
            try {
              const r = await api.platform.impersonate(c.id);
              await startImpersonation(r.accessToken);
              navigate('/admin');
            } catch (e: any) { toast.error(e.message); }
          }}>Impersonate tenant</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Stripe</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>Customer: {c.stripeCustomerId || '—'}</p>
          <p>Subscription: {c.stripeSubscriptionId || '—'}</p>
          {(c.billingInvoices || []).map((i: any) => (
            <div key={i.id} className="flex justify-between"><span>{i.number} · {i.status}</span><span>${i.amount}</span></div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
