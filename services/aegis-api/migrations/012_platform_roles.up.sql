-- Replace platform_staff boolean with platform_role enum (superadmin | admin | staff)
BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS platform_role TEXT
  CHECK (platform_role IS NULL OR platform_role IN ('superadmin', 'admin', 'staff'));

UPDATE account
SET platform_role = 'superadmin'
WHERE platform_staff = true AND platform_role IS NULL;

ALTER TABLE account DROP COLUMN IF EXISTS platform_staff;

COMMENT ON COLUMN account.platform_role IS
  'Salanor internal Platform Ops role. NULL = customer-only account. superadmin | admin | staff.';

COMMIT;
