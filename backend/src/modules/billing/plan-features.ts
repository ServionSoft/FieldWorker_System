import type { PoolClient } from 'pg';

export const PLAN_FEATURE_KEYS = [
  'reports',
  'calendar',
  'dispatch',
  'inventory',
  'api',
  'white_label',
  'multi_location',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

export const PLAN_FEATURE_CATALOG: { key: PlanFeatureKey; label: string }[] = [
  { key: 'reports', label: 'Reports' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'dispatch', label: 'Dispatch board' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'api', label: 'API access' },
  { key: 'white_label', label: 'White labeling' },
  { key: 'multi_location', label: 'Multi-location' },
];

export function isPlanFeature(value: string): value is PlanFeatureKey {
  return (PLAN_FEATURE_KEYS as readonly string[]).includes(value);
}

export async function loadPlanFeatures(client: PoolClient, companyId: string): Promise<PlanFeatureKey[]> {
  const { rows } = await client.query(
    `SELECT coalesce(p.feature_keys, '{}') AS feature_keys
     FROM companies c
     JOIN subscription_plans p ON p.id = c.plan_id
     WHERE c.id = $1`,
    [companyId],
  );
  const raw = (rows[0]?.feature_keys as string[] | undefined) ?? [];
  return raw.filter(isPlanFeature);
}
