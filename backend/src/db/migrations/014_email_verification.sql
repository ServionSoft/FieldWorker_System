ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified_at IS NULL;

INSERT INTO platform_email_templates (type, name, subject, body) VALUES
  (
    'email_verification',
    'Email verification',
    'Verify your FieldPro email',
    'Hi {name},

Verify your email to activate your FieldPro trial for {companyName}.

{verifyLink}

This link expires in 24 hours.

If you did not create this account, you can ignore this email.'
  )
ON CONFLICT (type) DO NOTHING;
