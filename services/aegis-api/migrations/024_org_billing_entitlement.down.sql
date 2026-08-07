BEGIN;

DROP INDEX IF EXISTS organization_billing_event_org_created_idx;
DROP TABLE IF EXISTS organization_billing_event;

ALTER TABLE organization
  DROP COLUMN IF EXISTS current_period_end,
  DROP COLUMN IF EXISTS current_period_start,
  DROP COLUMN IF EXISTS billing_status,
  DROP COLUMN IF EXISTS billing_source;

COMMIT;
