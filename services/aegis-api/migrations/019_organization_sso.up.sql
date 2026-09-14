-- Enterprise SSO (WorkOS) per organization

CREATE TABLE IF NOT EXISTS organization_sso (
  organization_id        UUID PRIMARY KEY REFERENCES organization (organization_id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'workos' CHECK (provider = 'workos'),
  workos_organization_id TEXT NOT NULL,
  enabled                BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_sso_workos ON organization_sso (workos_organization_id)
  WHERE enabled = true;
