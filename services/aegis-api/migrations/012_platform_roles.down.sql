BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS platform_staff BOOLEAN NOT NULL DEFAULT false;

UPDATE account SET platform_staff = true WHERE platform_role IS NOT NULL;

ALTER TABLE account DROP COLUMN IF EXISTS platform_role;

COMMIT;
