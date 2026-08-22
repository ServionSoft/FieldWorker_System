export const PLAN_FEATURE_CATALOG = [
  { key: 'reports', label: 'Reports' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'dispatch', label: 'Dispatch board' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'api', label: 'API access' },
  { key: 'white_label', label: 'White labeling' },
  { key: 'multi_location', label: 'Multi-location' },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_CATALOG)[number]['key'];
