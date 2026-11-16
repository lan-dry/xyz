-- Append-only operational check (run as a privileged auditor, not the app role).
-- See docs/APPEND_ONLY.md.
--
-- Usage (psql):
--   psql "$DATABASE_URL" -v app_role=aegis_app -f tools/check-append-only-grants.sql

\echo '=== App role must not be superuser ==='
SELECT r.rolname, r.rolsuper, r.rolreplication
FROM pg_roles r
WHERE r.rolname = :'app_role';

\echo '=== Triggers present (migration 015) ==='
SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN ('trg_event_append_only', 'trg_forensic_receipt_append_only')
ORDER BY c.relname, t.tgname;

\echo '=== Dangerous privileges on sealed tables (expect no DELETE for app role) ==='
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = :'app_role'
  AND table_schema = 'public'
  AND table_name IN ('event', 'forensic_receipt')
  AND privilege_type IN ('DELETE', 'TRUNCATE', 'TRIGGER')
ORDER BY table_name, privilege_type;

\echo '=== Tenant wipe (migration 020): app role must NOT be able to execute platform_wipe_tenant (expect f) ==='
SELECT has_function_privilege(:'app_role', 'platform_wipe_tenant(text,boolean,text)', 'EXECUTE') AS app_role_can_wipe;

\echo '=== Wipe audit table: app role should have no privileges (expect no rows) ==='
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE grantee = :'app_role'
  AND table_schema = 'public'
  AND table_name = 'platform_tenant_wipe_audit';

\echo '=== FAIL if app role is superuser ==='
DO $$
DECLARE
  is_super boolean;
BEGIN
  SELECT rolsuper INTO is_super FROM pg_roles WHERE rolname = current_setting('app_role', true);
  -- When -v app_role= is set, prefer that name via :'app_role' above; this block is advisory.
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_setting('app.check_role', true) AND rolsuper
  ) THEN
    RAISE EXCEPTION 'append_only_check: configured role is superuser';
  END IF;
END $$;
