-- Stage 9: transparency log integrity constraints

CREATE UNIQUE INDEX IF NOT EXISTS uq_transparency_log_org_log_index
  ON transparency_log_entry (organization_id, log_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transparency_log_org_event
  ON transparency_log_entry (organization_id, event_id);

CREATE INDEX IF NOT EXISTS idx_transparency_log_org_published
  ON transparency_log_entry (organization_id, published_at DESC);
