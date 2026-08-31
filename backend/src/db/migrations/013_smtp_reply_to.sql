ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS smtp_reply_to TEXT;

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS smtp_reply_to TEXT;

CREATE TABLE IF NOT EXISTS platform_email_templates (
  type TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_email_templates (type, name, subject, body) VALUES
  ('password_reset', 'Password reset', 'Reset your FieldPro password', 'Use this link to reset your password: {resetUrl}'),
  ('welcome', 'Welcome', 'Welcome to FieldPro', 'Welcome {name}. Your company {companyName} is ready.'),
  ('tenant_invitation', 'Invitation', 'You are invited to FieldPro', 'Join {companyName}: {inviteUrl}'),
  ('system_notification', 'System notification', 'FieldPro notification', '{message}'),
  ('subscription_started', 'Subscription started', 'Your FieldPro subscription', 'Your subscription for {companyName} is active.'),
  ('payment_failed', 'Payment failed', 'Payment failed for FieldPro', 'Payment failed for {companyName}. Please update billing.')
ON CONFLICT (type) DO NOTHING;
