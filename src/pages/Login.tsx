import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle, Eye, EyeOff, Mail, Lock, Building2, CheckCircle2, ArrowRight,
  CalendarDays, Radio, FileText, BarChart3, UserRound, Star, Briefcase, Clock, Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ApiError, api } from '@/lib/api';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, emailError, passwordMatchError, passwordMinError, requiredText } from '@/lib/formValidation';
import { postAuthPath } from '@/lib/postAuthPath';
import { FieldProWordmark } from '@/components/brand/FieldProMark';

function apiPortHint() {
  try {
    const url = import.meta.env.VITE_API_URL || 'http://localhost:4100/api';
    return new URL(url).port || '4100';
  } catch {
    return '4100';
  }
}

function signInErrorMessage(err: unknown) {
  const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
  if (status === 429) {
    return 'Too many sign-in attempts. Wait a few minutes, then try again.';
  }
  if (err instanceof ApiError) return err.message;
  if (typeof err === 'object' && err && 'message' in err && typeof (err as Error).message === 'string' && status) {
    return (err as Error).message;
  }
  return `Could not sign in. Is the API running on port ${apiPortHint()}?`;
}

const capabilities = [
  { title: 'Smart Scheduling', desc: 'Optimize routes and assignments', icon: CalendarDays, tone: 'bg-[#2563EB]/30 text-white' },
  { title: 'Live Dispatch', desc: 'Real-time job tracking & updates', icon: Radio, tone: 'bg-[#16A34A]/30 text-white' },
  { title: 'Invoicing', desc: 'Create, send and get paid faster', icon: FileText, tone: 'bg-[#7C3AED]/30 text-white' },
  { title: 'Business Insights', desc: 'Data that helps you grow', icon: BarChart3, tone: 'bg-[#D97706]/30 text-white' },
];

const stats = [
  { n: '2.5K+', l: 'Active Shops', icon: Store },
  { n: '150K+', l: 'Jobs Completed', icon: Briefcase },
  { n: '4.9', l: 'Crew Rating', icon: Star },
  { n: '98.6%', l: 'On-time Jobs', icon: Clock },
];

const Login = () => {
  const [email, setEmail] = useState(() => localStorage.getItem('fp_remember_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(!!localStorage.getItem('fp_remember_email'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'forgot'>(() =>
    searchParams.get('tab') === 'signup' ? 'signup' : 'login',
  );
  const login = useAppStore((s) => s.login);
  const hydrate = useAppStore((s) => s.hydrate);
  const register = useAppStore((s) => s.register);
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');
  const [pendingResetEmail, setPendingResetEmail] = useState('');
  const planId = searchParams.get('plan') || undefined;

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'signup' || tab === 'forgot' || tab === 'login') setActiveTab(tab);
  }, [searchParams]);

  const goHome = () => {
    const { currentUser, company } = useAppStore.getState();
    toast.success(`Welcome back, ${currentUser?.name}!`);
    navigate(postAuthPath(currentUser, company), { replace: true });
  };

  const enterIfVerified = async () => {
    const pwd = signupPassword || password;
    if (!pendingVerifyEmail || !pwd) return false;
    try {
      const success = await login(pendingVerifyEmail, pwd);
      if (success) {
        setPendingVerifyEmail('');
        goHome();
        return true;
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_UNVERIFIED') return false;
    }
    return false;
  };

  useEffect(() => {
    if (!pendingVerifyEmail) return;
    const pwd = signupPassword || password;
    if (!pwd) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await enterIfVerified();
    };
    const interval = window.setInterval(tick, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    const onStorage = async (event: StorageEvent) => {
      if (event.key !== 'fp_access' || !event.newValue) return;
      await hydrate();
      if (useAppStore.getState().isAuthenticated) {
        setPendingVerifyEmail('');
        goHome();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [pendingVerifyEmail, signupPassword, password, hydrate, login, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const next = applyErrors({
      email: emailError(email, { required: true }),
      password: requiredText(password, 'Password'),
    });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      const success = await login(email, password);
      setLoading(false);
      if (success) {
        if (remember) localStorage.setItem('fp_remember_email', email);
        else localStorage.removeItem('fp_remember_email');
        goHome();
      } else {
        setError('Invalid email or password.');
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && err.code === 'EMAIL_UNVERIFIED') {
        setPendingVerifyEmail(email.trim());
        setError('');
        toast.message(err.message);
        return;
      }
      setError(signInErrorMessage(err));
    }
  };

  const handleSignup = async () => {
    const next = applyErrors({
      ownerName: requiredText(ownerName, 'Your name'),
      companyName: requiredText(companyName, 'Company name'),
      signupEmail: emailError(signupEmail, { required: true }),
      signupPassword: passwordMinError(signupPassword),
      confirmPassword: passwordMatchError(signupPassword, confirmPassword),
    });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      const created = await register(companyName.trim(), signupEmail.trim(), signupPassword, planId, ownerName.trim());
      setPendingVerifyEmail(signupEmail.trim());
      if (created.emailSent === false) {
        toast.error(created.emailError || 'Account created, but the verification email could not be sent.');
      } else {
        toast.success('Check your email and click the verification link to continue.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerifyEmail) return;
    setLoading(true);
    try {
      const result = await api.auth.resendVerification(pendingVerifyEmail);
      if (result.delivered === false) {
        toast.error(result.error || 'Could not send the verification email. Check Super Admin SMTP settings.');
      } else {
        toast.success('If that account needs verification, a new link was sent.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not resend verification email');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const next = applyErrors({ forgotEmail: emailError(forgotEmail, { required: true }) });
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await api.auth.forgot(forgotEmail.trim());
      setPendingResetEmail(forgotEmail.trim());
      toast.success('If that account exists, we sent a reset link.');
    } catch {
      toast.error('Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh md:h-dvh md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] xl:grid-cols-2 bg-[#F8FAFC] overflow-x-hidden">
      {/* Brand panel — tablet+ */}
      <aside className="relative hidden md:flex min-h-0 flex-col overflow-hidden text-white">
        <img
          src="/login-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[72%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#061B3A]/90 via-[#061B3A]/62 to-[#061B3A]/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#061B3A]/80 via-transparent to-[#061B3A]/35" />
        <div
          className="pointer-events-none absolute right-6 top-6 h-40 w-40 opacity-[0.18]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1.5px)',
            backgroundSize: '14px 14px',
          }}
        />

        <div className="relative z-10 flex min-h-full flex-col justify-between gap-8 p-6 lg:p-10 xl:p-14">
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => navigate('/')} className="text-left shrink-0">
              <FieldProWordmark inverted />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
              Live Dispatch
            </span>
          </div>

          <div className="max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#93C5FD] mb-3 lg:mb-4">
              Plumbing · Electrical · HVAC · More
            </p>
            <h2 className="font-heading font-bold tracking-tight text-white leading-[1.12] text-[clamp(1.75rem,3.4vw,3.75rem)]">
              Run your field service business{' '}
              <span className="text-[#3B82F6]">like a pro.</span>
            </h2>
            <p className="mt-3 lg:mt-4 max-w-md text-sm lg:text-base leading-relaxed text-white/70">
              Schedule jobs, dispatch teams, track progress in real-time, and close more jobs—faster.
            </p>

            <div className="mt-6 lg:mt-8 grid grid-cols-2 gap-x-4 gap-y-4">
              {capabilities.map((item) => (
                <div key={item.title} className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}>
                    <item.icon className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white leading-tight">{item.title}</p>
                    <p className="text-xs text-white/55 mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-[12px] border border-white/10 bg-black/25 backdrop-blur-md overflow-hidden">
            {stats.map((s) => (
              <div key={s.l} className="px-3 xl:px-4 py-3.5">
                <s.icon className="w-3.5 h-3.5 text-white/40 mb-2" strokeWidth={1.75} />
                <p className="font-heading text-lg xl:text-xl font-semibold tabular-nums leading-none">{s.n}</p>
                <p className="text-[11px] text-white/50 mt-1.5 leading-tight">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Auth panel */}
      <main className="relative flex min-h-dvh md:min-h-0 md:h-full flex-col justify-center overflow-y-auto overflow-x-hidden bg-white px-4 py-8 xs:px-5 sm:px-8 md:px-8 lg:px-12 xl:px-16">
        <div className="w-full max-w-[420px] mx-auto">
          <button type="button" onClick={() => navigate('/')} className="md:hidden mb-8 text-left">
            <FieldProWordmark />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {activeTab === 'login' && !pendingVerifyEmail && (
                <>
                  <p className="text-sm text-slate-500 mb-1.5">Welcome back 👋</p>
                  <h1 className="font-heading text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight text-[#0F172A]">
                    Sign in to your account
                  </h1>
                  <p className="text-sm text-[#64748B] mt-2 mb-7">
                    Access your dashboard and manage your operations.
                  </p>
                </>
              )}
              {activeTab === 'signup' && !pendingVerifyEmail && (
                <>
                  <p className="text-sm text-slate-500 mb-1.5">Free trial</p>
                  <h1 className="font-heading text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight text-[#0F172A]">
                    Create your workspace
                  </h1>
                  <p className="text-sm text-[#64748B] mt-2 mb-7">
                    14-day trial. Invite your team when you’re ready.
                  </p>
                </>
              )}
              {pendingVerifyEmail && (
                <>
                  <p className="text-sm text-slate-500 mb-1.5">Check your inbox</p>
                  <h1 className="font-heading text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight text-[#0F172A]">
                    Verify your email
                  </h1>
                  <p className="text-sm text-[#64748B] mt-2 mb-7">
                    We send a verification link to <span className="font-medium text-[#0F172A]">{pendingVerifyEmail}</span>. Click that link, then this page will open your workspace. If nothing arrives, check spam or tap resend — Super Admin SMTP must be configured.
                  </p>
                </>
              )}
              {activeTab === 'forgot' && !pendingResetEmail && (
                <>
                  <p className="text-sm text-slate-500 mb-1.5">Account recovery</p>
                  <h1 className="font-heading text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight text-[#0F172A]">
                    Reset password
                  </h1>
                  <p className="text-sm text-[#64748B] mt-2 mb-7">
                    Enter the email on your account. If it exists, we’ll send a reset link that expires in 1 hour.
                  </p>
                </>
              )}
              {pendingResetEmail && (
                <>
                  <p className="text-sm text-slate-500 mb-1.5">Check your inbox</p>
                  <h1 className="font-heading text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight text-[#0F172A]">
                    Reset link sent
                  </h1>
                  <p className="text-sm text-[#64748B] mt-2 mb-7">
                    If <span className="font-medium text-[#0F172A]">{pendingResetEmail}</span> has a FieldPro account, open that email and click <span className="font-medium text-[#0F172A]">Reset password</span>. The link expires in 1 hour.
                  </p>
                </>
              )}

              {pendingVerifyEmail && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[#64748B]">
                    After you click the email link, come back here if this tab is still waiting — it will continue on its own, or tap continue below.
                  </p>
                  <Button className="w-full h-12 font-semibold rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={loading} onClick={async () => {
                    setLoading(true);
                    const ok = await enterIfVerified();
                    setLoading(false);
                    if (!ok) toast.message('Not verified yet. Open the link in your email first.');
                  }}>
                    {loading ? 'Checking…' : 'I’ve verified — continue'}
                  </Button>
                  <Button variant="outline" className="w-full h-12 font-semibold rounded-[10px]" disabled={loading} onClick={handleResendVerification}>
                    {loading ? 'Sending…' : 'Resend verification email'}
                  </Button>
                  <p className="text-center text-sm text-[#64748B]">
                    Wrong address?{' '}
                    <button type="button" className="text-[#2563EB] font-medium hover:underline" onClick={() => { setPendingVerifyEmail(''); setActiveTab('signup'); }}>
                      Use a different email
                    </button>
                  </p>
                </div>
              )}

              {activeTab === 'login' && !pendingVerifyEmail && (
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="min-w-0 break-words">{error}</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[#0F172A]">Work email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        className="pl-10 h-12 rounded-[10px] border-[#E5E7EB]"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFieldErrors((x) => ({ ...x, email: '' })); }}
                        autoComplete="email"
                        {...fieldInvalidProps('email', fieldErrors.email)}
                      />
                    </div>
                    <FieldError id="email-error" message={fieldErrors.email} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[#0F172A]">Password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        className="pl-10 pr-12 h-12 rounded-[10px] border-[#E5E7EB]"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setFieldErrors((x) => ({ ...x, password: '' })); }}
                        autoComplete="current-password"
                        {...fieldInvalidProps('password', fieldErrors.password)}
                      />
                      <button
                        type="button"
                        className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-slate-400 hover:text-slate-700"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FieldError id="password-error" message={fieldErrors.password} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="flex items-center gap-2.5 cursor-pointer min-h-11">
                      <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
                      <span className="text-[#64748B]">Remember me</span>
                    </label>
                    <button type="button" className="text-[#2563EB] font-medium hover:text-[#1D4ED8] min-h-11 shrink-0" onClick={() => setActiveTab('forgot')}>
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">Sign in <ArrowRight className="w-4 h-4" /></span>
                    )}
                  </Button>
                  <p className="text-center text-sm text-[#64748B] pt-0.5">
                    New to FieldPro?{' '}
                    <button type="button" className="text-[#2563EB] font-medium hover:underline" onClick={() => setActiveTab('signup')}>Start a free trial</button>
                  </p>
                </form>
              )}

              {activeTab === 'signup' && !pendingVerifyEmail && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerName">Your name</Label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="ownerName" className="pl-10 h-12 rounded-[10px]" placeholder="Jane Mitchell" value={ownerName} onChange={(e) => { setOwnerName(e.target.value); setFieldErrors((x) => ({ ...x, ownerName: '' })); }} {...fieldInvalidProps('ownerName', fieldErrors.ownerName)} />
                    </div>
                    <FieldError id="ownerName-error" message={fieldErrors.ownerName} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName">Company name</Label>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="companyName" className="pl-10 h-12 rounded-[10px]" placeholder="Mitchell Plumbing Co." value={companyName} onChange={(e) => { setCompanyName(e.target.value); setFieldErrors((x) => ({ ...x, companyName: '' })); }} {...fieldInvalidProps('companyName', fieldErrors.companyName)} />
                    </div>
                    <FieldError id="companyName-error" message={fieldErrors.companyName} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signupEmail">Work email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="signupEmail" type="email" className="pl-10 h-12 rounded-[10px]" placeholder="you@company.com" value={signupEmail} onChange={(e) => { setSignupEmail(e.target.value); setFieldErrors((x) => ({ ...x, signupEmail: '' })); }} {...fieldInvalidProps('signupEmail', fieldErrors.signupEmail)} />
                    </div>
                    <FieldError id="signupEmail-error" message={fieldErrors.signupEmail} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <Label htmlFor="signupPassword">Password</Label>
                      <Input id="signupPassword" type="password" className="h-12 rounded-[10px]" placeholder="8+ characters" value={signupPassword} onChange={(e) => { setSignupPassword(e.target.value); setFieldErrors((x) => ({ ...x, signupPassword: '' })); }} {...fieldInvalidProps('signupPassword', fieldErrors.signupPassword)} />
                      <FieldError id="signupPassword-error" message={fieldErrors.signupPassword} />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <Label htmlFor="confirmPassword">Confirm</Label>
                      <Input id="confirmPassword" type="password" className="h-12 rounded-[10px]" placeholder="Repeat" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((x) => ({ ...x, confirmPassword: '' })); }} {...fieldInvalidProps('confirmPassword', fieldErrors.confirmPassword)} />
                      <FieldError id="confirmPassword-error" message={fieldErrors.confirmPassword} />
                    </div>
                  </div>
                  <ul className="text-xs text-[#64748B] space-y-1.5">
                    {['Office and field portals', 'Customers, jobs, and invoicing', 'Cancel anytime'].map((t) => (
                      <li key={t} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />{t}</li>
                    ))}
                  </ul>
                  <Button className="w-full h-12 font-semibold rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={loading} onClick={handleSignup}>
                    {loading ? 'Creating…' : 'Create account'}
                  </Button>
                  <p className="text-center text-sm text-[#64748B]">
                    Already have access?{' '}
                    <button type="button" className="text-[#2563EB] font-medium hover:underline" onClick={() => setActiveTab('login')}>Sign in</button>
                  </p>
                </div>
              )}

              {activeTab === 'forgot' && pendingResetEmail && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[#64748B]">
                    Didn’t get it? Check spam, then you can send another link. Use only the newest email.
                  </p>
                  <Button className="w-full h-12 font-semibold rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={loading} onClick={handleForgot}>
                    {loading ? 'Sending…' : 'Resend reset link'}
                  </Button>
                  <p className="text-center text-sm text-[#64748B]">
                    <button type="button" className="text-[#2563EB] font-medium hover:underline" onClick={() => { setPendingResetEmail(''); setActiveTab('login'); }}>
                      Back to sign in
                    </button>
                  </p>
                </div>
              )}

              {activeTab === 'forgot' && !pendingResetEmail && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgotEmail">Work email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="forgotEmail" type="email" className="pl-10 h-12 rounded-[10px]" placeholder="you@company.com" value={forgotEmail} onChange={(e) => { setForgotEmail(e.target.value); setFieldErrors((x) => ({ ...x, forgotEmail: '' })); }} {...fieldInvalidProps('forgotEmail', fieldErrors.forgotEmail)} />
                    </div>
                    <FieldError id="forgotEmail-error" message={fieldErrors.forgotEmail} />
                  </div>
                  <Button className="w-full h-12 font-semibold rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={handleForgot} disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </Button>
                  <p className="text-center text-sm text-[#64748B]">
                    <button type="button" className="text-[#2563EB] font-medium hover:underline" onClick={() => setActiveTab('login')}>Back to sign in</button>
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <p className="text-center text-[11px] leading-relaxed text-slate-400 mt-8 px-1">
            <Lock className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            By continuing you agree to FieldPro’s Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
