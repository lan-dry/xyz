-- Schema only: compliance_export.created_at for Free-tier export counting.
-- Plan limits and Stripe prices: change in Platform Ops → Plans (no migration).
BEGIN;

ALTER TABLE compliance_export
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE compliance_export
SET created_at = COALESCE(generated_at, period_start)
WHERE created_at IS NULL;

ALTER TABLE compliance_export
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE compliance_export
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE compliance_export
  ALTER COLUMN created_at SET NOT NULL;

COMMIT;
