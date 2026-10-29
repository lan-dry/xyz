CREATE TABLE IF NOT EXISTS organization_scim (
  organization_id UUID PRIMARY KEY REFERENCES organization (organization_id) ON DELETE CASCADE,
  bearer_token_hash TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  default_role TEXT NOT NULL DEFAULT 'engineer'
    CHECK (default_role IN ('admin', 'engineer', 'auditor', 'viewer')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
