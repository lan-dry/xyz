BEGIN;

ALTER TABLE compliance_export
  DROP COLUMN IF EXISTS event_count,
  DROP COLUMN IF EXISTS byte_size;

COMMIT;
