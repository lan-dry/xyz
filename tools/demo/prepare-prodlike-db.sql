-- App role for production-like local boots (not a superuser).
-- Run as the postgres/salanor superuser against the demo database:
--   docker exec -i aegis-pg-demo psql -U salanor -d aegis < tools/demo/prepare-prodlike-db.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
    CREATE ROLE aegis_app LOGIN PASSWORD 'aegis_app_local' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END$$;

GRANT CONNECT ON DATABASE aegis TO aegis_app;
GRANT USAGE ON SCHEMA public TO aegis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aegis_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aegis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aegis_app;
-- Append-only tables: keep revoke of UPDATE/DELETE if your grants script already did so.
