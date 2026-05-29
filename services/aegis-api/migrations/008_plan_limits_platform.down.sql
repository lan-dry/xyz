BEGIN;

DROP TABLE IF EXISTS organization_usage_monthly;
ALTER TABLE organization DROP COLUMN IF EXISTS plan_overrides;
DROP TABLE IF EXISTS plan_catalog;

COMMIT;
