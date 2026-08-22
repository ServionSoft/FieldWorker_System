import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PLAN_FEATURE_CATALOG } from '@/lib/planFeatures';

export function UpgradeRequired({ feature }: { feature: string }) {
  const label = PLAN_FEATURE_CATALOG.find((f) => f.key === feature)?.label ?? feature;
  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-4">
      <h1 className="text-2xl font-heading font-bold">Upgrade to unlock {label}</h1>
      <p className="text-muted-foreground text-sm">
        This module is not included in your current plan. Switch plans from Billing to get access.
      </p>
      <Button asChild className="gradient-primary text-primary-foreground">
        <Link to="/admin/settings?tab=billing">View plans</Link>
      </Button>
    </div>
  );
}
