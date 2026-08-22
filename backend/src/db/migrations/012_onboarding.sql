ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE companies
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE onboarding_completed_at IS NULL
  AND NULLIF(BTRIM(name), '') IS NOT NULL
  AND NULLIF(BTRIM(email::text), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(phone, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(address, '')), '') IS NOT NULL;
