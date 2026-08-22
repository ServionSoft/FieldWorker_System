-- Notifications: event key + deep link
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_path TEXT;

-- Expand company member roles
ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE company_members ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('owner', 'admin', 'dispatcher', 'office', 'field_worker'));

ALTER TABLE company_members ADD COLUMN IF NOT EXISTS notify_email_assignments BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS notify_email_invoices BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS notify_email_billing BOOLEAN NOT NULL DEFAULT true;

-- First admin of each company becomes owner
UPDATE company_members m SET role = 'owner'
WHERE m.role = 'admin'
  AND m.id = (
    SELECT m2.id FROM company_members m2
    WHERE m2.company_id = m.company_id AND m2.role IN ('admin', 'owner')
    ORDER BY m2.created_at ASC
    LIMIT 1
  );

CREATE TABLE IF NOT EXISTS company_member_permissions (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  PRIMARY KEY (member_id, permission),
  FOREIGN KEY (company_id, member_id) REFERENCES company_members (company_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_member_permissions_company_idx ON company_member_permissions (company_id);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'dispatcher', 'office', 'field_worker')),
  token_hash TEXT NOT NULL,
  invited_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_company_idx ON invitations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations (token_hash);

CREATE TABLE IF NOT EXISTS company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  default_tax_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  website TEXT,
  invoice_footer TEXT,
  logo_file_id UUID REFERENCES files(id),
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password_enc TEXT,
  smtp_secure BOOLEAN NOT NULL DEFAULT true,
  smtp_from_name TEXT,
  smtp_from_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER company_settings_updated BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password_enc TEXT,
  smtp_secure BOOLEAN NOT NULL DEFAULT true,
  smtp_from_name TEXT,
  smtp_from_email TEXT,
  trial_days INTEGER NOT NULL DEFAULT 14,
  support_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Stripe / SaaS billing
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_cents_yearly INTEGER;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE companies ADD CONSTRAINT companies_status_check
  CHECK (status IN ('active', 'trial', 'suspended', 'past_due'));

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_tax_pct NUMERIC(6,3);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_file_id UUID REFERENCES files(id);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  number TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  hosted_url TEXT,
  pdf_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_invoices_company_idx ON billing_invoices (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  company_id UUID REFERENCES companies(id),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for new tenant tables
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'company_member_permissions', 'invitations', 'company_settings', 'billing_invoices'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (company_id = app_company_id() OR app_is_super_admin())
         WITH CHECK (company_id = app_company_id() OR app_is_super_admin())',
      t || '_isolation', t
    );
  END LOOP;
END $$;
