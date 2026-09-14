BEGIN;

ALTER TABLE plan_catalog
  DROP COLUMN IF EXISTS list_price,
  DROP COLUMN IF EXISTS list_price_detail,
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS billing_note,
  DROP COLUMN IF EXISTS marketing_highlighted;

COMMIT;
