-- CRM: notes, follow-ups, email comms

CREATE TABLE customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  author_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id) ON DELETE CASCADE
);
CREATE INDEX customer_notes_customer_idx ON customer_notes (company_id, customer_id, created_at DESC);

CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  estimate_id UUID,
  job_id UUID,
  title TEXT NOT NULL,
  due_date DATE,
  done BOOLEAN NOT NULL DEFAULT false,
  assigned_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id) ON DELETE CASCADE
);
CREATE INDEX follow_ups_company_idx ON follow_ups (company_id, done, due_date);
CREATE INDEX follow_ups_customer_idx ON follow_ups (company_id, customer_id);

ALTER TABLE communications DROP CONSTRAINT IF EXISTS communications_type_check;
ALTER TABLE communications ADD CONSTRAINT communications_type_check
  CHECK (type IN ('call', 'sms', 'voicemail', 'mms', 'email'));

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_notes_isolation ON customer_notes
  USING (company_id = app_company_id() OR app_is_super_admin())
  WITH CHECK (company_id = app_company_id());

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups FORCE ROW LEVEL SECURITY;
CREATE POLICY follow_ups_isolation ON follow_ups
  USING (company_id = app_company_id() OR app_is_super_admin())
  WITH CHECK (company_id = app_company_id());
