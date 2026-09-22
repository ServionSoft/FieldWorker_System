import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  ArrowRight, Check, Star, BarChart3, Users, CalendarDays,
  Package, MessageSquare, FileText, Shield, Clock, Phone, Mail, MapPin,
} from 'lucide-react';
import { FieldProMark, FieldProWordmark } from '@/components/brand/FieldProMark';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FieldError } from '@/components/crm/FieldError';
import { applyErrors, emailError, requiredText } from '@/lib/formValidation';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

const features = [
  { icon: CalendarDays, title: 'Smart Scheduling', desc: 'Drag-and-drop calendar with worker availability and conflict detection.' },
  { icon: Users, title: 'Team Management', desc: 'Track worker schedules, specialties, and real-time availability.' },
  { icon: BarChart3, title: 'Live Dashboard', desc: 'Real-time KPIs for jobs, revenue, and team performance at a glance.' },
  { icon: Package, title: 'Inventory Tracking', desc: 'Monitor stock levels with low-stock alerts and usage tracking.' },
  { icon: FileText, title: 'Invoicing & Billing', desc: 'Generate professional invoices and track payment status.' },
  { icon: MessageSquare, title: 'Team Chat', desc: 'Built-in messaging between office and field workers.' },
  { icon: Shield, title: 'Role-Based Access', desc: 'Separate portals for admins, dispatchers, and field workers.' },
  { icon: Clock, title: 'Offline Mode', desc: 'Field workers stay productive even without internet.' },
];

const fallbackPlans = [
  { id: '', name: 'Basic', price: 49, period: '/mo', desc: 'For solo operators', features: ['Up to 5 workers', '50 jobs/month', 'Basic reports', 'Email support'], popular: false },
  { id: '', name: 'Pro', price: 99, period: '/mo', desc: 'For growing teams', features: ['Up to 20 workers', 'Unlimited jobs', 'Advanced reports', 'Priority support', 'Calendar view', 'Inventory management'], popular: true },
  { id: '', name: 'Enterprise', price: 249, period: '/mo', desc: 'For large operations', features: ['Unlimited workers', 'Unlimited jobs', 'Custom reports', 'API access', 'Dedicated support', 'White labeling', 'Multi-location'], popular: false },
];

const testimonials = [
  { name: 'Mike Torres', role: 'Owner, Torres Plumbing', photo: '/images/portrait-mike-torres.png', initials: 'MT', text: 'FieldPro cut our scheduling chaos by 80%. We went from sticky notes to a real system overnight.', rating: 5 },
  { name: 'Lisa Chen', role: 'Operations Manager, BrightSpark Electric', photo: '/images/portrait-lisa-chen.png', initials: 'LC', text: 'The calendar view alone saved us 10 hours a week. Our dispatchers love the drag-and-drop.', rating: 5 },
  { name: 'David Park', role: 'CEO, ComfortZone HVAC', photo: '/images/portrait-david-park.png', initials: 'DP', text: 'Finally, a system that actually understands field service. Invoicing + inventory in one place is a game changer.', rating: 5 },
];

const stats = [
  { value: '2,500+', label: 'Active Businesses' },
  { value: '150K+', label: 'Jobs Completed' },
  { value: '98%', label: 'Uptime' },
  { value: '4.9/5', label: 'Avg Rating' },
];

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#contact', label: 'Contact' },
];

const Index = () => {
  const navigate = useNavigate();
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', company: '', message: '' });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [contactSending, setContactSending] = useState(false);
  const [plans, setPlans] = useState(fallbackPlans);

  useEffect(() => {
    api.publicPlans().then((r) => {
      if (!r.items?.length) return;
      setPlans(r.items.map((p: any, i: number) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        period: p.billing === 'yearly' ? '/yr' : '/mo',
        desc: p.name === 'Pro' ? 'For growing teams' : p.name === 'Enterprise' ? 'For large operations' : 'For solo operators',
        features: p.features || [],
        popular: p.name === 'Pro' || i === 1,
      })));
    }).catch(() => { /* keep fallback */ });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <FieldProMark size={28} />
            <span className="truncate font-heading text-[15px] font-semibold tracking-tight">FieldPro</span>
          </div>
          <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" className="px-2.5 sm:px-3" onClick={() => navigate('/login')}>Sign In</Button>
            <Button size="sm" className="px-2.5 sm:px-3" onClick={() => navigate('/login?tab=signup')}>
              <span className="sm:hidden">Get started</span>
              <span className="hidden sm:inline">Start Free Trial</span>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-border">
        <img
          src="/images/hero-crm-dashboard.png"
          alt="FieldPro CRM dashboard showing jobs, customers, invoices, and calendar"
          className="absolute inset-0 size-full object-cover object-[70%_center] opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/55" />
        <div className="relative mx-auto flex min-h-[32rem] max-w-6xl items-center px-6 py-20 sm:min-h-[36rem] lg:min-h-[42rem] lg:py-28">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.45 }} className="max-w-xl">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Trusted by 2,500+ service businesses
            </p>
            <h1 className="text-[2.5rem] font-heading font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              The CRM for service businesses
            </h1>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Customers, jobs, estimates, invoices, and your team — in one clean workspace built for growing field-service companies.
            </p>
            <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/login?tab=signup')}>
                Start Free 14-Day Trial
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => navigate('/login')}>
                View Live Demo
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No credit card · 14-day trial · Cancel anytime
            </p>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col gap-1"
            >
              <p className="font-heading text-2xl font-semibold tracking-tight">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-xl">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Features</p>
            <h2 className="text-3xl font-heading font-semibold tracking-tight sm:text-4xl">
              Everything You Need to Manage Field Operations
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              From scheduling to invoicing, FieldPro covers every aspect of running a field service business.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-x-16 gap-y-10 sm:grid-cols-2">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ delay: i * 0.03 }}
                className="flex gap-4"
              >
                <f.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-[15px] font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-xl">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pricing</p>
            <h2 className="text-3xl font-heading font-semibold tracking-tight sm:text-4xl">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-muted-foreground">Start free. Scale as you grow. No hidden fees.</p>
          </motion.div>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ delay: i * 0.06 }}
                className={cn(
                  'flex flex-col gap-6 border-t pt-6',
                  plan.popular ? 'border-foreground' : 'border-border',
                )}
              >
                <div className="flex flex-col gap-1">
                  {plan.popular && (
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Most Popular</p>
                  )}
                  <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-semibold tracking-tight">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full" variant={plan.popular ? 'default' : 'outline'} onClick={() => navigate(plan.id ? `/login?tab=signup&plan=${plan.id}` : '/login?tab=signup')}>
                  Start Free Trial
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-xl">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Testimonials</p>
            <h2 className="text-3xl font-heading font-semibold tracking-tight sm:text-4xl">Loved by Service Pros</h2>
          </motion.div>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.blockquote
                key={t.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ delay: i * 0.06 }}
                className="flex flex-col gap-5 border-t border-border pt-6"
              >
                <div className="flex gap-0.5">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="size-3.5 fill-foreground/70 text-foreground/70" />
                  ))}
                </div>
                <p className="text-[15px] leading-relaxed text-muted-foreground">“{t.text}”</p>
                <footer className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={t.photo} alt={t.name} />
                    <AvatarFallback>{t.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.role}</p>
                  </div>
                </footer>
              </motion.blockquote>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-20 lg:grid-cols-2 lg:gap-20 lg:py-24">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contact</p>
            <h2 className="text-3xl font-heading font-semibold tracking-tight sm:text-4xl">Ready to Get Started?</h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
              Have questions? Our team is here to help you find the perfect plan for your business.
            </p>
            <img
              src="/images/contact-office.png"
              alt="Field service office desk with a job calendar open on a laptop"
              className="mt-8 aspect-[4/3] w-full max-w-md rounded-lg object-cover"
            />
            <div className="mt-8 flex flex-col gap-4 text-sm">
              <div className="flex items-center gap-3">
                <Phone className="size-4 text-muted-foreground" />
                (555) 123-4567
              </div>
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground" />
                hello@fieldpro.io
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-muted-foreground" />
                123 Business Ave, Suite 100, San Francisco, CA
              </div>
            </div>
          </motion.div>
          <motion.form
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ delay: 0.08 }}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const next = applyErrors({
                firstName: requiredText(contact.firstName, 'First name'),
                lastName: requiredText(contact.lastName, 'Last name'),
                email: emailError(contact.email, { required: true }),
                message: contact.message.trim().length < 10 ? 'Message must be at least 10 characters' : '',
              });
              setContactErrors(next);
              if (Object.values(next).some(Boolean)) return;
              setContactSending(true);
              try {
                await api.contact({
                  firstName: contact.firstName.trim(),
                  lastName: contact.lastName.trim(),
                  email: contact.email.trim(),
                  company: contact.company.trim() || undefined,
                  message: contact.message.trim(),
                });
                setContact({ firstName: '', lastName: '', email: '', company: '', message: '' });
                toast.success("Message sent. Check your inbox for a confirmation from FieldPro.");
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Could not send your message. Try again later.');
              } finally {
                setContactSending(false);
              }
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-first">First Name</Label>
                <Input
                  id="contact-first"
                  name="firstName"
                  placeholder="John"
                  autoComplete="given-name"
                  value={contact.firstName}
                  onChange={(e) => { setContact((c) => ({ ...c, firstName: e.target.value })); setContactErrors((x) => ({ ...x, firstName: '' })); }}
                />
                <FieldError id="firstName-error" message={contactErrors.firstName} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-last">Last Name</Label>
                <Input
                  id="contact-last"
                  name="lastName"
                  placeholder="Smith"
                  autoComplete="family-name"
                  value={contact.lastName}
                  onChange={(e) => { setContact((c) => ({ ...c, lastName: e.target.value })); setContactErrors((x) => ({ ...x, lastName: '' })); }}
                />
                <FieldError id="lastName-error" message={contactErrors.lastName} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                name="email"
                type="email"
                placeholder="john@company.com"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => { setContact((c) => ({ ...c, email: e.target.value })); setContactErrors((x) => ({ ...x, email: '' })); }}
              />
              <FieldError id="email-error" message={contactErrors.email} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-company">Company</Label>
              <Input
                id="contact-company"
                name="company"
                placeholder="Your Company"
                autoComplete="organization"
                value={contact.company}
                onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                name="message"
                placeholder="Tell us about your needs..."
                className="min-h-[100px]"
                value={contact.message}
                onChange={(e) => { setContact((c) => ({ ...c, message: e.target.value })); setContactErrors((x) => ({ ...x, message: '' })); }}
              />
              <FieldError id="message-error" message={contactErrors.message} />
            </div>
            <Button type="submit" className="w-full" disabled={contactSending}>
              {contactSending ? 'Sending…' : 'Send Message'}
              {!contactSending && <ArrowRight data-icon="inline-end" />}
            </Button>
          </motion.form>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 lg:flex-row lg:items-end lg:justify-between lg:py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="max-w-xl">
            <h2 className="text-3xl font-heading font-semibold tracking-tight sm:text-4xl">
              Start Running Your Business Smarter Today
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Join thousands of service professionals who trust FieldPro to manage their operations.
            </p>
          </motion.div>
          <Button size="lg" className="shrink-0 self-start" onClick={() => navigate('/login?tab=signup')}>
            Get Started Free
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="flex flex-col gap-3">
              <FieldProWordmark stacked={false} />
              <p className="text-sm text-muted-foreground">The complete field service management platform.</p>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Product</h4>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground">Integrations</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Company</h4>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#contact" className="hover:text-foreground">Contact</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Legal</h4>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
              </ul>
            </div>
          </div>
          <Separator className="my-8" />
          <p className="text-sm text-muted-foreground">© 2026 FieldPro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
