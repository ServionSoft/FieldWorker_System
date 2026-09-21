UPDATE platform_email_templates
SET
  subject = 'Reset your FieldPro password',
  body = 'Hi {name},

We received a request to reset the password for your FieldPro account.

This link expires in 1 hour:
{resetUrl}

If you did not request this, you can ignore this email. Your password will stay the same.',
  updated_at = now()
WHERE type = 'password_reset';
