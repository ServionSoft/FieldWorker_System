import { useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Crown, Zap, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { PLAN_FEATURE_CATALOG } from '@/lib/planFeatures';

const emptyForm = {
  name: '', price: '', priceYearly: '', maxWorkers: '5', maxJobs: '50',
  features: '', featureKeys: ['reports'] as string[],
};

const iconMap: Record<string, any> = { 'Basic': Zap, 'Pro': Crown, 'Enterprise': Building2 };
const colorMap: Record<string, string> = { 'Basic': 'from-primary/80 to-primary', 'Pro': 'from-accent/80 to-accent', 'Enterprise': 'from-warning/80 to-warning' };

const Subscriptions = () => {
  const { plans, companies, updatePlan, addPlan } = useFieldPro();
  const [editPlan, setEditPlan] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);

  const openEdit = (plan: any) => {
    setEditPlan(plan);
    setForm({
      name: plan.name, price: String(plan.price), priceYearly: String(plan.priceYearly || ''),
      maxWorkers: String(plan.maxWorkers), maxJobs: String(plan.maxJobs),
      features: (plan.features || []).join(', '),
      featureKeys: plan.featureKeys || [],
    });
  };

  const toggleFeature = (key: string, on: boolean) => {
    setForm((f) => ({
      ...f,
      featureKeys: on ? [...f.featureKeys, key] : f.featureKeys.filter((k) => k !== key),
    }));
  };

  const handleSave = async () => {
    const body = {
      name: form.name, price: parseFloat(form.price), priceYearly: form.priceYearly ? parseFloat(form.priceYearly) : undefined,
      maxWorkers: Number(form.maxWorkers), maxJobs: Number(form.maxJobs),
      features: form.features.split(',').map((s) => s.trim()).filter(Boolean),
      featureKeys: form.featureKeys,
    };
    if (showCreate) await addPlan(body);
    else if (editPlan) await updatePlan(editPlan.id, body);
    toast.success('Plan saved');
    setEditPlan(null);
    setShowCreate(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground text-sm">Manage pricing, limits, and modules. Checkout uses these amounts directly.</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setForm(emptyForm); }}>New plan</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan, i) => {
          const Icon = iconMap[plan.name] || Zap;
          const subscriberCount = companies.filter(c => c.planId === plan.id).length;
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={`shadow-theme-md hover:shadow-theme-lg transition-all relative overflow-hidden ${plan.name === 'Pro' ? 'ring-2 ring-primary' : ''}`}>
                {plan.name === 'Pro' && <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">Popular</div>}
                <CardHeader className="text-center pb-2">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorMap[plan.name]} mx-auto flex items-center justify-center mb-3`}>
                    <Icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <CardTitle className="font-heading text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold font-heading">${plan.price}</span>
                    <span className="text-muted-foreground text-sm">/{plan.billing}</span>
                  </div>
                  <CardDescription>{subscriberCount} active subscriber{subscriberCount !== 1 ? 's' : ''}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-success shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {(plan.featureKeys || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(plan.featureKeys as string[]).map((k) => (
                        <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 space-y-2">
                    <Button variant="outline" className="w-full" onClick={() => openEdit(plan)}>Edit Plan</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={!!editPlan || showCreate} onOpenChange={() => { setEditPlan(null); setShowCreate(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{showCreate ? 'New plan' : 'Edit plan'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Monthly $</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-1"><Label>Yearly $</Label><Input type="number" value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} /></div>
              <div className="space-y-1"><Label>Max workers (-1 ∞)</Label><Input value={form.maxWorkers} onChange={(e) => setForm({ ...form, maxWorkers: e.target.value })} /></div>
              <div className="space-y-1"><Label>Max jobs/mo (-1 ∞)</Label><Input value={form.maxJobs} onChange={(e) => setForm({ ...form, maxJobs: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Marketing bullets (comma-separated)</Label><Input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Enabled modules</Label>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_FEATURE_CATALOG.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.featureKeys.includes(f.key)}
                      onCheckedChange={(v) => toggleFeature(f.key, !!v)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditPlan(null); setShowCreate(false); }}>Cancel</Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subscriptions;
