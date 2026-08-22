import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Wind, ArrowRight, CheckCircle2, Star, BarChart3, Users, CalendarDays,
  Package, MessageSquare, FileText, Shield, Clock, TrendingUp, ChevronRight, Phone, Mail, MapPin
} from 'lucide-react';
import { FieldProMark } from '@/components/brand/FieldProMark';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

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
  { name: 'Basic', price: 49, period: '/mo', desc: 'For solo operators', features: ['Up to 5 workers', '50 jobs/month', 'Basic reports', 'Email support'], popular: false },
  { name: 'Pro', price: 99, period: '/mo', desc: 'For growing teams', features: ['Up to 20 workers', 'Unlimited jobs', 'Advanced reports', 'Priority support', 'Calendar view', 'Inventory management'], popular: true },
  { name: 'Enterprise', price: 249, period: '/mo', desc: 'For large operations', features: ['Unlimited workers', 'Unlimited jobs', 'Custom reports', 'API access', 'Dedicated support', 'White labeling', 'Multi-location'], popular: false },
];

const testimonials = [
  { name: 'Mike Torres', role: 'Owner, Torres Plumbing', text: "FieldPro cut our scheduling chaos by 80%. We went from sticky notes to a real system overnight.", rating: 5 },
  { name: 'Lisa Chen', role: 'Operations Manager, BrightSpark Electric', text: "The calendar view alone saved us 10 hours a week. Our dispatchers love the drag-and-drop.", rating: 5 },
  { name: 'David Park', role: 'CEO, ComfortZone HVAC', text: "Finally, a system that actually understands field service. Invoicing + inventory in one place is a game changer.", rating: 5 },
];

const stats = [
  { value: '2,500+', label: 'Active Businesses' },
  { value: '150K+', label: 'Jobs Completed' },
  { value: '98%', label: 'Uptime' },
  { value: '4.9/5', label: 'Avg Rating' },
];

const Index = () => {
  const navigate = useNavigate();
  const [contactEmail, setContactEmail] = useState('');
  const [plans, setPlans] = useState(fallbackPlans);

  useEffect(() => {
    api.publicPlans().then((r) => {
      if (!r.items?.length) return;
      setPlans(r.items.map((p: any, i: number) => ({
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
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <FieldProMark size={32} />
            <span className="font-heading font-bold text-xl">FieldPro</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
            <a href="#contact" className="hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
            <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => navigate('/login?tab=signup')}>
              Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.6 }} className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium">
              🚀 Trusted by 2,500+ service businesses
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold tracking-tight mb-6 leading-tight">
              The CRM for <span className="text-gradient">service businesses</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Customers, jobs, estimates, invoices, and your team — in one clean workspace built for growing field-service companies.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="gradient-primary text-primary-foreground text-base px-8 h-12" onClick={() => navigate('/login?tab=signup')}>
                Start Free 14-Day Trial <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 h-12" onClick={() => navigate('/login')}>
                View Live Demo
              </Button>
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> No credit card</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> 14-day trial</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Cancel anytime</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.1 }} className="text-center">
                <p className="text-3xl font-heading font-bold text-gradient">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold mb-4">Everything You Need to Manage Field Operations</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">From scheduling to invoicing, FieldPro covers every aspect of running a field service business.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.05 }}>
                <Card className="h-full hover:shadow-theme-lg transition-shadow border-border group">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <f.icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="font-heading font-semibold mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground text-lg">Start free. Scale as you grow. No hidden fees.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.1 }}>
                <Card className={`h-full relative ${plan.popular ? 'border-primary shadow-theme-lg scale-105' : 'border-border'}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="gradient-primary text-primary-foreground px-4">Most Popular</Badge>
                    </div>
                  )}
                  <CardContent className="p-8">
                    <h3 className="font-heading font-bold text-xl mb-1">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.desc}</p>
                    <div className="flex items-baseline gap-1 mb-6">
                      <span className="text-4xl font-heading font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <Button className={`w-full mb-6 ${plan.popular ? 'gradient-primary text-primary-foreground' : ''}`} variant={plan.popular ? 'default' : 'outline'} onClick={() => navigate('/login?tab=signup')}>
                      Start Free Trial
                    </Button>
                    <ul className="space-y-3">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Testimonials</Badge>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold mb-4">Loved by Service Pros</h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.1 }}>
                <Card className="h-full border-border">
                  <CardContent className="p-6">
                    <div className="flex gap-1 mb-4">
                      {[...Array(t.rating)].map((_, j) => <Star key={j} className="w-4 h-4 fill-warning text-warning" />)}
                    </div>
                    <p className="text-sm leading-relaxed mb-4 text-muted-foreground">"{t.text}"</p>
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <Badge variant="secondary" className="mb-4">Contact</Badge>
              <h2 className="text-3xl sm:text-4xl font-heading font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">Have questions? Our team is here to help you find the perfect plan for your business.</p>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm"><Phone className="w-5 h-5 text-primary" /> (555) 123-4567</div>
                <div className="flex items-center gap-3 text-sm"><Mail className="w-5 h-5 text-primary" /> hello@fieldpro.io</div>
                <div className="flex items-center gap-3 text-sm"><MapPin className="w-5 h-5 text-primary" /> 123 Business Ave, Suite 100, San Francisco, CA</div>
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: 0.2 }}>
              <Card className="border-border">
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium mb-1.5 block">First Name</label><Input placeholder="John" /></div>
                    <div><label className="text-sm font-medium mb-1.5 block">Last Name</label><Input placeholder="Smith" /></div>
                  </div>
                  <div><label className="text-sm font-medium mb-1.5 block">Email</label><Input type="email" placeholder="john@company.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></div>
                  <div><label className="text-sm font-medium mb-1.5 block">Company</label><Input placeholder="Your Company" /></div>
                  <div><label className="text-sm font-medium mb-1.5 block">Message</label><textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px]" placeholder="Tell us about your needs..." /></div>
                  <Button className="w-full gradient-primary text-primary-foreground" onClick={() => { toast.success('Message sent! We\'ll get back to you within 24 hours.'); setContactEmail(''); }}>
                    Send Message <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold mb-4">Start Running Your Business Smarter Today</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">Join thousands of service professionals who trust FieldPro to manage their operations.</p>
            <Button size="lg" className="gradient-primary text-primary-foreground text-base px-10 h-12" onClick={() => navigate('/login?tab=signup')}>
              Get Started Free <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FieldProMark size={28} />
                <span className="font-heading font-bold">FieldPro</span>
              </div>
              <p className="text-sm text-muted-foreground">The complete field service management platform.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#contact" className="hover:text-foreground transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            © 2026 FieldPro. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
