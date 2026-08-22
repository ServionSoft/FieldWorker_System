ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS feature_keys TEXT[] NOT NULL DEFAULT '{}';

UPDATE subscription_plans
SET feature_keys = ARRAY['reports']
WHERE name = 'Basic';

UPDATE subscription_plans
SET feature_keys = ARRAY['reports', 'calendar', 'dispatch', 'inventory']
WHERE name = 'Pro';

UPDATE subscription_plans
SET feature_keys = ARRAY['reports', 'calendar', 'dispatch', 'inventory', 'api', 'white_label', 'multi_location']
WHERE name = 'Enterprise';
