ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS governance_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organization.governance_settings IS
  'Org governance: approval_ttl_hours, stale_trace_hours, notification channels';
