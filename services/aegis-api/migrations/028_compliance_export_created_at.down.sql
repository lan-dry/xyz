BEGIN;

ALTER TABLE compliance_export DROP COLUMN IF EXISTS created_at;

COMMIT;
