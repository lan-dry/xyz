-- Salanor internal staff (platform ops) — separate from customer org roles
BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS platform_staff BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN account.platform_staff IS
  'When true, account may use the Platform Ops app (ops.salanor.com) for cross-tenant administration.';

COMMIT;
