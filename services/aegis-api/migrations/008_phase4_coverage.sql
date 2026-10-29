-- Phase 4 Coverage: declared tools, workflow fail mode, local signed buffer drain.

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS declared_tools JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE governed_workflow
  ADD COLUMN IF NOT EXISTS fail_mode TEXT NOT NULL DEFAULT 'fail_closed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'governed_workflow_fail_mode_check'
  ) THEN
    ALTER TABLE governed_workflow
      ADD CONSTRAINT governed_workflow_fail_mode_check
      CHECK (fail_mode IN ('fail_closed', 'fail_open_buffer'));
  END IF;
END $$;

-- Queue for fail-open local signed events that drain when Aegis is reachable again.
CREATE TABLE IF NOT EXISTS signed_event_buffer (
  buffer_id       TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  environment     TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  event_json      JSONB NOT NULL,
  signature_b64   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  drained_at      TIMESTAMPTZ,
  drain_error     TEXT
);

CREATE INDEX IF NOT EXISTS signed_event_buffer_pending_idx
  ON signed_event_buffer (organization_id, drained_at)
  WHERE drained_at IS NULL;
