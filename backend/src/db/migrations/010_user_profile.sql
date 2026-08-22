ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key TEXT;

UPDATE users
SET
  first_name = CASE WHEN first_name = '' THEN split_part(btrim(name), ' ', 1) ELSE first_name END,
  last_name = CASE
    WHEN last_name = '' AND position(' ' in btrim(name)) > 0
      THEN btrim(substr(btrim(name), position(' ' in btrim(name)) + 1))
    ELSE last_name
  END
WHERE first_name = '' OR last_name = '';
