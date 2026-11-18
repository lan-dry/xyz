-- B7: stop defaulting new orgs to us-east. Product region for EU hosting is eu-west.
ALTER TABLE organization ALTER COLUMN region SET DEFAULT 'eu-west';

-- Existing demo / unset orgs that still show the old default.
UPDATE organization
SET region = 'eu-west'
WHERE region = 'us-east'
  AND (is_demo = true OR is_test = true);

-- B5: clear values for masked fields, revealable only to auditor (and org admins).
CREATE TABLE IF NOT EXISTS sensitive_field_vault (
  vault_id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  case_id TEXT,
  trace_id TEXT,
  event_id TEXT,
  field_path TEXT NOT NULL,
  clear_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensitive_field_vault_org_trace_idx
  ON sensitive_field_vault (organization_id, trace_id);

CREATE INDEX IF NOT EXISTS sensitive_field_vault_org_case_idx
  ON sensitive_field_vault (organization_id, case_id);
