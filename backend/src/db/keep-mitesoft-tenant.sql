-- Live cleanup: hide every company except Mitesoft.
-- Preview first: SELECT id, name, email, status FROM companies WHERE deleted_at IS NULL ORDER BY name;
-- Do NOT run seed.ts on production.

BEGIN;

UPDATE company_members m
SET status = 'inactive'
FROM companies c
WHERE m.company_id = c.id
  AND c.deleted_at IS NULL
  AND c.name NOT ILIKE '%Mitesoft%';

UPDATE companies
SET deleted_at = now(),
    status = 'suspended'
WHERE deleted_at IS NULL
  AND name NOT ILIKE '%Mitesoft%';

DELETE FROM refresh_tokens
WHERE user_id IN (
  SELECT m.user_id
  FROM company_members m
  JOIN companies c ON c.id = m.company_id
  WHERE c.name NOT ILIKE '%Mitesoft%'
);

COMMIT;

-- Remaining tenant:
-- SELECT id, name, email FROM companies WHERE deleted_at IS NULL;
-- SELECT u.email, u.name, m.role
-- FROM users u
-- JOIN company_members m ON m.user_id = u.id
-- JOIN companies c ON c.id = m.company_id
-- WHERE c.name ILIKE '%Mitesoft%'
-- ORDER BY m.role;
