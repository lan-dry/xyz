BEGIN;

CREATE TABLE compliance_export_schedule (
  schedule_id     TEXT PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES organization (organization_id) ON DELETE CASCADE,
  bundle_type     TEXT NOT NULL DEFAULT 'combined'
    CHECK (bundle_type IN ('soc2', 'eu_ai_act', 'combined')),
  cadence         TEXT NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('monthly')),
  enabled         BOOLEAN NOT NULL DEFAULT false,
  day_of_month    INT NOT NULL DEFAULT 1
    CHECK (day_of_month BETWEEN 1 AND 28),
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_schedule_due
  ON compliance_export_schedule (next_run_at)
  WHERE enabled = true;

COMMIT;
