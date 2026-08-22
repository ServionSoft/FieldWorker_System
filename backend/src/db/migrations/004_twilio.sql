ALTER TABLE companies ADD COLUMN IF NOT EXISTS twilio_number TEXT;

ALTER TABLE communications ADD COLUMN IF NOT EXISTS twilio_sid TEXT;
CREATE INDEX IF NOT EXISTS communications_twilio_sid_idx ON communications (twilio_sid);
