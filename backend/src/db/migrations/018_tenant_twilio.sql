ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS twilio_from_number TEXT;
