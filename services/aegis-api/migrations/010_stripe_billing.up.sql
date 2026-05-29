-- Phase D: Stripe customer id on organization
BEGIN;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organization_stripe_customer
  ON organization (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMIT;
