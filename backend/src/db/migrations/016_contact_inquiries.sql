CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_email_templates (type, name, subject, body) VALUES
  (
    'contact_confirmation',
    'Contact confirmation',
    'We received your message — FieldPro',
    'Hi {name},

Thanks for contacting FieldPro. We received your message and will get back to you within 24 hours.

Your message:
{message}

— FieldPro'
  )
ON CONFLICT (type) DO NOTHING;
