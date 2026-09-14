-- Ops-editable list prices and marketing fields (www.salanor.com/pricing reads plan_catalog).
BEGIN;

ALTER TABLE plan_catalog
  ADD COLUMN IF NOT EXISTS list_price TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS list_price_detail TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marketing_highlighted BOOLEAN NOT NULL DEFAULT false;

UPDATE plan_catalog SET
  list_price = '$0',
  list_price_detail = 'forever',
  tagline = 'Evaluate and demo',
  billing_note = 'Self-serve signup · no card',
  marketing_highlighted = false,
  events_per_month = 10000,
  max_ingest_keys = 3,
  max_members = 5,
  retention_days = 90
WHERE plan_slug = 'free';

UPDATE plan_catalog SET
  list_price = '$299',
  list_price_detail = '/ month',
  tagline = 'Production governance',
  billing_note = 'Billed monthly · annual discount on request',
  marketing_highlighted = true,
  events_per_month = 100000,
  max_ingest_keys = 15,
  max_members = 25,
  retention_days = 365
WHERE plan_slug = 'team';

UPDATE plan_catalog SET
  list_price = 'Custom',
  list_price_detail = 'from ~$999 / mo',
  tagline = 'Regulated scale',
  billing_note = 'Annual contract · invoice or PO',
  marketing_highlighted = false
WHERE plan_slug = 'enterprise';

COMMIT;
