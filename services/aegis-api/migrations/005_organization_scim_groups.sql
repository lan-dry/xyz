CREATE TABLE IF NOT EXISTS organization_scim_group (
  scim_group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  external_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'engineer'
    CHECK (role IN ('admin', 'engineer', 'auditor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id),
  UNIQUE (organization_id, display_name)
);

CREATE INDEX IF NOT EXISTS organization_scim_group_org_idx
  ON organization_scim_group (organization_id);

CREATE TABLE IF NOT EXISTS organization_scim_group_member (
  scim_group_id UUID NOT NULL
    REFERENCES organization_scim_group (scim_group_id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  PRIMARY KEY (scim_group_id, membership_id)
);

CREATE INDEX IF NOT EXISTS organization_scim_group_member_membership_idx
  ON organization_scim_group_member (membership_id);
