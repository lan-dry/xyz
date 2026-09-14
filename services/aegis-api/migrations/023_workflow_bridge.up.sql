-- Workflow Bridge: server-held signing material + run correlation for n8n/Zapier.
ALTER TABLE signing_key
  ADD COLUMN IF NOT EXISTS private_key_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS bridge_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN signing_key.private_key_ciphertext IS
  'AES-256-GCM ciphertext of Ed25519 private key for Workflow Bridge server signing. Null for client-held keys.';
COMMENT ON COLUMN signing_key.bridge_enabled IS
  'When true, this key may be used by /v1/aegis/workflows/* to sign events server-side.';

CREATE TABLE IF NOT EXISTS workflow_run (
  trace_id            TEXT PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organization (organization_id),
  agent_id            TEXT NOT NULL REFERENCES agent (agent_id),
  key_id              TEXT NOT NULL REFERENCES signing_key (key_id),
  external_system     TEXT NOT NULL DEFAULT 'n8n',
  external_workflow_id TEXT,
  external_execution_id TEXT,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  root_event_id       TEXT,
  business_context    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workflow_run_org_created_idx
  ON workflow_run (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_run_external_idx
  ON workflow_run (organization_id, external_system, external_execution_id)
  WHERE external_execution_id IS NOT NULL;
