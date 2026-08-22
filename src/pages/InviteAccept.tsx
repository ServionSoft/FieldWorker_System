import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, passwordMatchError, passwordMinError, requiredText } from '@/lib/formValidation';

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ email: string; name?: string; role: string; companyName: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.invites.get(token).then((d) => {
      setInfo(d);
      setName(d.name || '');
    }).catch((e) => setError(e.message || 'Invalid invitation'));
  }, [token]);

  const accept = async () => {
    if (!token) return;
    const next = applyErrors({
      name: requiredText(name, 'Name'),
      password: passwordMinError(password),
      confirm: passwordMatchError(password, confirm),
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      await api.invites.accept(token, { name: name.trim(), password });
      toast.success('Account ready. Sign in to continue.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.message || 'Could not accept invite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {info && (
            <>
              <p className="text-sm text-muted-foreground">
                Join <strong>{info.companyName}</strong> as <strong>{info.role}</strong> ({info.email})
              </p>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: '' })); }} {...fieldInvalidProps('name', errors.name)} />
                <FieldError id="name-error" message={errors.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: '' })); }} {...fieldInvalidProps('password', errors.password)} />
                <FieldError id="password-error" message={errors.password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: '' })); }} {...fieldInvalidProps('confirm', errors.confirm)} />
                <FieldError id="confirm-error" message={errors.confirm} />
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={accept} disabled={saving}>
                {saving ? 'Creating…' : 'Create account'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
