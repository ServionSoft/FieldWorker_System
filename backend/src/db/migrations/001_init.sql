CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean AS $$
  SELECT current_setting('app.is_super_admin', true) = 'true';
$$ LANGUAGE sql STABLE;

-- ─── Platform ─────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  max_workers INTEGER NOT NULL,
  max_jobs INTEGER NOT NULL,
  features TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER plans_updated BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  address TEXT,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'trial', 'suspended')),
  trial_ends_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'field_worker')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id),
  UNIQUE (company_id, id)
);
CREATE INDEX company_members_user_idx ON company_members (user_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  company_id UUID REFERENCES companies(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_company_idx ON audit_logs (company_id, created_at DESC);

CREATE TABLE document_counters (
  company_id UUID NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'estimate')),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind, year)
);

-- ─── CRM ──────────────────────────────────────────────────

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'lead')),
  customer_type TEXT CHECK (customer_type IN ('residential', 'commercial')),
  source TEXT,
  parent_customer_id UUID,
  payment_terms TEXT,
  tax_exempt BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX customers_company_idx ON customers (company_id);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE customers
  ADD CONSTRAINT customers_parent_fk
  FOREIGN KEY (company_id, parent_customer_id) REFERENCES customers (company_id, id);

CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  phone_ext TEXT,
  email CITEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id) ON DELETE CASCADE
);
CREATE INDEX customer_contacts_customer_idx ON customer_contacts (company_id, customer_id);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  location_name TEXT,
  street TEXT,
  unit TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  gated_property BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id) ON DELETE CASCADE
);
CREATE INDEX addresses_customer_idx ON addresses (company_id, customer_id);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  UNIQUE (company_id, name),
  UNIQUE (company_id, id)
);

CREATE TABLE customer_tags (
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  PRIMARY KEY (customer_id, tag_id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, tag_id) REFERENCES tags (company_id, id) ON DELETE CASCADE
);

-- ─── Workforce ────────────────────────────────────────────

CREATE TABLE worker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  member_id UUID NOT NULL,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  employment_status TEXT NOT NULL CHECK (employment_status IN ('active', 'inactive', 'on_leave')),
  UNIQUE (member_id),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, member_id) REFERENCES company_members (company_id, id) ON DELETE CASCADE
);

CREATE TABLE worker_specialties (
  company_id UUID NOT NULL,
  worker_profile_id UUID NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (worker_profile_id, name),
  FOREIGN KEY (company_id, worker_profile_id) REFERENCES worker_profiles (company_id, id) ON DELETE CASCADE
);

CREATE TABLE worker_availability (
  company_id UUID NOT NULL,
  worker_profile_id UUID NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME,
  end_time TIME,
  PRIMARY KEY (worker_profile_id, weekday),
  FOREIGN KEY (company_id, worker_profile_id) REFERENCES worker_profiles (company_id, id) ON DELETE CASCADE
);

CREATE TABLE worker_time_off (
  company_id UUID NOT NULL,
  worker_profile_id UUID NOT NULL,
  off_date DATE NOT NULL,
  PRIMARY KEY (worker_profile_id, off_date),
  FOREIGN KEY (company_id, worker_profile_id) REFERENCES worker_profiles (company_id, id) ON DELETE CASCADE
);

-- ─── Jobs / estimates / invoices (circular FKs added after) ─

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  address_id UUID,
  estimate_id UUID,
  invoice_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'hvac', 'general')),
  scheduled_date DATE,
  scheduled_time TIME,
  arrival_end_time TIME,
  multi_day BOOLEAN NOT NULL DEFAULT false,
  end_date DATE,
  estimated_duration_hours NUMERIC(6,2) NOT NULL DEFAULT 1,
  po_number TEXT,
  job_source TEXT,
  agent_rep TEXT,
  notes_for_techs TEXT,
  completion_notes TEXT,
  note_to_customer TEXT,
  requires_follow_up BOOLEAN NOT NULL DEFAULT false,
  notify_techs BOOLEAN NOT NULL DEFAULT true,
  billing_type TEXT CHECK (billing_type IN ('single_invoice', 'progress_billing', 'no_charge')),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  FOREIGN KEY (company_id, address_id) REFERENCES addresses (company_id, id)
);
CREATE INDEX jobs_company_idx ON jobs (company_id, scheduled_date);
CREATE TRIGGER jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  address_id UUID,
  estimate_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'converted')),
  converted_job_id UUID,
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'hvac', 'general')),
  description TEXT,
  notes TEXT,
  note_to_customer TEXT,
  notes_for_techs TEXT,
  po_number TEXT,
  referral_source TEXT,
  opportunity_rating SMALLINT,
  opportunity_owner_id UUID,
  requested_on DATE,
  arrival_start TIME,
  arrival_end TIME,
  estimated_duration_hours NUMERIC(6,2),
  valid_until DATE,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, estimate_number),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  FOREIGN KEY (company_id, address_id) REFERENCES addresses (company_id, id)
);
CREATE TRIGGER estimates_updated BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  job_id UUID,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (company_id, invoice_number),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id)
);

ALTER TABLE jobs
  ADD CONSTRAINT jobs_estimate_fk FOREIGN KEY (company_id, estimate_id) REFERENCES estimates (company_id, id);
ALTER TABLE jobs
  ADD CONSTRAINT jobs_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id);
ALTER TABLE estimates
  ADD CONSTRAINT estimates_converted_job_fk FOREIGN KEY (company_id, converted_job_id) REFERENCES jobs (company_id, id);
ALTER TABLE invoices
  ADD CONSTRAINT invoices_job_fk FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id);

CREATE TABLE job_assignees (
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  member_id UUID NOT NULL,
  PRIMARY KEY (job_id, member_id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, member_id) REFERENCES company_members (company_id, id)
);

CREATE TABLE job_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE
);

CREATE TABLE job_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  author_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE
);

CREATE TABLE job_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  inventory_item_id UUID,
  name TEXT NOT NULL,
  quantity NUMERIC(12,2) DEFAULT 1,
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE
);

CREATE TABLE job_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  group_name TEXT,
  description TEXT NOT NULL,
  warehouse TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT true,
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE
);

CREATE TABLE estimate_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  estimate_id UUID NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (company_id, estimate_id) REFERENCES estimates (company_id, id) ON DELETE CASCADE
);

CREATE TABLE estimate_assignees (
  company_id UUID NOT NULL,
  estimate_id UUID NOT NULL,
  member_id UUID NOT NULL,
  PRIMARY KEY (estimate_id, member_id),
  FOREIGN KEY (company_id, estimate_id) REFERENCES estimates (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, member_id) REFERENCES company_members (company_id, id)
);

CREATE TABLE estimate_follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  estimate_id UUID NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY (company_id, estimate_id) REFERENCES estimates (company_id, id) ON DELETE CASCADE
);

CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id) ON DELETE CASCADE
);

-- ─── Inventory ────────────────────────────────────────────

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (company_id, sku),
  UNIQUE (company_id, id)
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  item_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receive', 'adjust', 'consume')),
  quantity_delta INTEGER NOT NULL,
  job_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, item_id) REFERENCES inventory_items (company_id, id)
);

-- ─── Files / docs / agreements / templates ────────────────

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  original_name TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  file_id UUID NOT NULL,
  job_id UUID,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, file_id) REFERENCES files (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
);

CREATE TABLE job_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  file_id UUID NOT NULL,
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, file_id) REFERENCES files (company_id, id)
);

CREATE TABLE service_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  job_id UUID,
  title TEXT NOT NULL,
  terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'expired')),
  start_date DATE,
  end_date DATE,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
);

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('invoice', 'appointment', 'follow_up', 'welcome')),
  UNIQUE (company_id, id)
);

-- ─── Communications / chat / notifications ────────────────

CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('call', 'sms', 'voicemail', 'mms')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL,
  from_number TEXT NOT NULL DEFAULT '',
  to_number TEXT NOT NULL DEFAULT '',
  customer_id UUID,
  job_id UUID,
  estimate_id UUID,
  user_id UUID REFERENCES users(id),
  body TEXT,
  duration_sec INTEGER,
  recording_file_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id),
  FOREIGN KEY (company_id, estimate_id) REFERENCES estimates (company_id, id)
);
CREATE INDEX communications_company_idx ON communications (company_id, created_at DESC);

CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE chat_thread_participants (
  company_id UUID NOT NULL,
  thread_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (company_id, thread_id) REFERENCES chat_threads (company_id, id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  thread_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, thread_id) REFERENCES chat_threads (company_id, id) ON DELETE CASCADE
);
CREATE INDEX chat_messages_thread_idx ON chat_messages (thread_id, created_at);

CREATE TABLE chat_message_reads (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  read BOOLEAN NOT NULL DEFAULT false,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'customers', 'customer_contacts', 'addresses', 'tags', 'customer_tags',
    'worker_profiles', 'worker_specialties', 'worker_availability', 'worker_time_off',
    'jobs', 'job_assignees', 'job_tasks', 'job_notes', 'job_materials', 'job_line_items', 'job_images',
    'estimates', 'estimate_line_items', 'estimate_assignees', 'estimate_follow_up_tasks',
    'invoices', 'invoice_line_items',
    'inventory_items', 'inventory_movements',
    'files', 'documents', 'service_agreements', 'email_templates',
    'communications', 'chat_threads', 'chat_thread_participants', 'chat_messages',
    'document_counters'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (company_id = app_company_id() OR app_is_super_admin())
         WITH CHECK (company_id = app_company_id())',
      t || '_isolation', t
    );
  END LOOP;
END $$;

-- Notifications: tenant rows scoped; platform rows (company_id IS NULL) visible only to the target user via app code.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_isolation ON notifications
  USING (
    (company_id IS NOT NULL AND company_id = app_company_id())
    OR (company_id IS NULL AND user_id::text = current_setting('app.current_user_id', true))
    OR app_is_super_admin()
  )
  WITH CHECK (
    (company_id IS NOT NULL AND company_id = app_company_id())
    OR (company_id IS NULL AND app_is_super_admin())
  );
