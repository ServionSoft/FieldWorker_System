import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { postAuthPath } from '@/lib/postAuthPath';
import { emailError, applyErrors } from '@/lib/formValidation';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const acceptSession = useAppStore((s) => s.acceptSession);
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(token ? 'Verifying your email…' : 'This verification link is missing or invalid.');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const data = await api.auth.verifyEmail(token);
        acceptSession(data);
        setStatus('ok');
        setMessage('Email verified. Opening your workspace…');
        toast.success('Email verified. Your trial is ready.');
        const { currentUser, company } = useAppStore.getState();
        navigate(postAuthPath(currentUser, company), { replace: true });
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : 'This verification link is invalid or expired.');
      }
    })();
  }, [token, acceptSession, navigate]);

  const resend = async (e: FormEvent) => {
    e.preventDefault();
    const next = applyErrors({ email: emailError(email, { required: true }) });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSending(true);
    try {
      await api.auth.resendVerification(email.trim());
      toast.success('If that account needs verification, a new link was sent.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not resend verification email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Verify your email</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {status === 'ok' && (
            <Button onClick={() => {
              const { currentUser, company } = useAppStore.getState();
              navigate(postAuthPath(currentUser, company), { replace: true });
            }}>Continue to workspace</Button>
          )}
          {status === 'error' && (
            <form className="flex flex-col gap-3" onSubmit={resend} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="verify-email">Work email</Label>
                <Input
                  id="verify-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: '' })); }}
                  {...fieldInvalidProps('email', errors.email)}
                />
                <FieldError id="email-error" message={errors.email} />
              </div>
              <Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Resend verification email'}</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/login')}>Back to sign in</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
