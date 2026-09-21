import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, passwordMatchError, passwordMinError } from '@/lib/formValidation';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(token ? '' : 'This reset link is missing or invalid. Request a new one from the sign-in page.');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = applyErrors({
      password: passwordMinError(password),
      confirm: passwordMatchError(password, confirm) || passwordMinError(confirm),
    });
    setErrors(next);
    if (Object.values(next).some(Boolean) || !token) return;
    setSaving(true);
    setServerError('');
    try {
      await api.auth.reset(token, password);
      toast.success('Password updated. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'This reset link is invalid or expired. Request a new one.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a password with at least 8 characters. This link works once and expires after 1 hour.
          </p>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {serverError && <p className="text-sm text-destructive" role="alert">{serverError}</p>}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: '' })); }}
                {...fieldInvalidProps('password', errors.password)}
              />
              <FieldError id="password-error" message={errors.password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: '' })); }}
                {...fieldInvalidProps('confirm', errors.confirm)}
              />
              <FieldError id="confirm-error" message={errors.confirm} />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !token}>{saving ? 'Saving…' : 'Update password'}</Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/login')}>Back to sign in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
