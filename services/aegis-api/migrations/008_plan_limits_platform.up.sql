-- P1.5: plan catalog, monthly usage rollup, optional org overrides
BEGIN;

CREATE TABLE plan_catalog (
  plan_slug         TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  events_per_month  INT,
  max_ingest_keys   INT NOT NULL,
  max_members       INT NOT NULL,
  retention_days    INT NOT NULL DEFAULT 90,
  self_serve        BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  stripe_price_id   TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS plan_overrides JSONB;

CREATE TABLE organization_usage_monthly (
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  period_month    DATE NOT NULL,
  event_count     INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_month)
);

CREATE INDEX idx_org_usage_month ON organization_usage_monthly (period_month);

INSERT INTO plan_catalog (
  plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
  retention_days, self_serve, sort_order
) VALUES
  ('free', 'Free', 5000, 3, 5, 90, false, 10),
  ('team', 'Team', 50000, 10, 25, 365, true, 20),
  ('enterprise', 'Enterprise', NULL, 100, 500, 2555, false, 30)
ON CONFLICT (plan_slug) DO NOTHING;

COMMIT;
