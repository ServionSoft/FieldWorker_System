-- Archive, ownership, audit users, favorites, saved views

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS customers_archived_idx ON customers (company_id, archived_at);
CREATE INDEX IF NOT EXISTS jobs_archived_idx ON jobs (company_id, archived_at);
CREATE INDEX IF NOT EXISTS customers_owner_idx ON customers (company_id, owner_user_id);
CREATE INDEX IF NOT EXISTS jobs_owner_idx ON jobs (company_id, owner_user_id);

CREATE TABLE IF NOT EXISTS record_favorites (
  company_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'job', 'estimate', 'invoice')),
  entity_id UUID NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT true,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS record_favorites_company_idx ON record_favorites (company_id, user_id);
CREATE INDEX IF NOT EXISTS record_favorites_entity_idx ON record_favorites (company_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_user_idx ON saved_views (company_id, user_id, page);

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['record_favorites', 'saved_views'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I
           USING (company_id = app_company_id() OR app_is_super_admin())
           WITH CHECK (company_id = app_company_id())',
        t || '_isolation', t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldpro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON record_favorites, saved_views TO fieldpro_app;
  END IF;
END $$;
