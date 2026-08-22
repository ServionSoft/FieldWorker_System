ALTER TABLE communications DROP CONSTRAINT IF EXISTS communications_type_check;
ALTER TABLE communications ADD CONSTRAINT communications_type_check
  CHECK (type IN ('call', 'sms', 'voicemail', 'mms', 'email', 'note'));
