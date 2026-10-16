ALTER TABLE stoa_site
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS directory_group_external_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS stoa_site_directory_group_idx
  ON stoa_site (tenant_id, directory_group_external_id)
  WHERE directory_group_external_id IS NOT NULL;

COMMENT ON COLUMN stoa_site.directory_group_external_id IS
  'Matches organization_scim_group.external_id for auto site assignment on sign-in';
