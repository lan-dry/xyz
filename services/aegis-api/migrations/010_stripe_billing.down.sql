BEGIN;

DROP INDEX IF EXISTS idx_organization_stripe_customer;
ALTER TABLE organization DROP COLUMN IF EXISTS stripe_customer_id;

COMMIT;
