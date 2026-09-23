ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
