-- Aegis / Salanor — Schema v1 (initial)
-- ADR-0002: organization (not tenant)
-- Target: PostgreSQL 16+
-- Apply via Atlas / drizzle-kit / flyway

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core: organization & users (console)
-- ---------------------------------------------------------------------------

CREATE TABLE organization (
  organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'team', 'enterprise')),
  region          TEXT NOT NULL DEFAULT 'us-east'
    CHECK (region IN ('us-east', 'eu-west', 'ap-southeast')),
  topology        TEXT NOT NULL DEFAULT 'cloud'
    CHECK (topology IN ('cloud', 'byoc', 'onprem')),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "user" (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT,
  role            TEXT NOT NULL DEFAULT 'engineer'
    CHECK (role IN ('admin', 'engineer', 'auditor', 'viewer')),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ,
  UNIQUE (organization_id, email)
);

CREATE TABLE session (
  session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user" (user_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ingest authentication (machine)
-- ---------------------------------------------------------------------------

CREATE TABLE ingest_api_key (
  key_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_ingest_api_key_org ON ingest_api_key (organization_id);

CREATE TABLE idempotency_record (
  organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Agents, keys, identity (DID)
-- ---------------------------------------------------------------------------

CREATE TABLE agent (
  agent_id          TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  did               TEXT NOT NULL,
  slug              TEXT NOT NULL,
  display_name      TEXT,
  current_version   TEXT,
  default_policy_id TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE signing_key (
  key_id          TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agent (agent_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  kms_provider    TEXT CHECK (kms_provider IN ('aws', 'gcp', 'azure', 'vault', 'dev')),
  kms_key_arn     TEXT,
  public_key_b64  TEXT NOT NULL,
  algorithm       TEXT NOT NULL DEFAULT 'ed25519' CHECK (algorithm = 'ed25519'),
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_until     TIMESTAMPTZ,
  revoked         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE did_document (
  did_document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT NOT NULL REFERENCES agent (agent_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  document_json   JSONB NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------

CREATE TABLE policy (
  policy_id       TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  version         INT NOT NULL,
  rego_source     TEXT,
  wasm_artifact_uri TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by      UUID REFERENCES "user" (user_id),
  activated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy_rule (
  rule_id       TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policy (policy_id) ON DELETE CASCADE,
  tool_pattern  TEXT NOT NULL,
  decision      TEXT NOT NULL
    CHECK (decision IN ('allow', 'deny', 'allow_with_obligation', 'allow_retro_audit')),
  conditions    JSONB,
  obligations   JSONB,
  priority      INT NOT NULL DEFAULT 0
);

CREATE TABLE approval_channel (
  channel_id      TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL
    CHECK (channel_type IN ('slack_oauth', 'web_ui', 'email')),
  config          JSONB,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Traces & events (hot ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE trace (
  trace_id        TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL REFERENCES agent (agent_id),
  root_event_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  total_events    INT NOT NULL DEFAULT 0,
  denied_events   INT NOT NULL DEFAULT 0,
  approved_events INT NOT NULL DEFAULT 0
);

CREATE TABLE event (
  event_id            TEXT PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  trace_id            TEXT NOT NULL REFERENCES trace (trace_id),
  parent_event_id     TEXT REFERENCES event (event_id),
  agent_id            TEXT NOT NULL REFERENCES agent (agent_id),
  key_id              TEXT NOT NULL REFERENCES signing_key (key_id),
  policy_id           TEXT REFERENCES policy (policy_id),
  schema_version      INT NOT NULL DEFAULT 1,
  sequence_num        BIGINT NOT NULL,
  prev_event_hash     TEXT,
  event_hash          TEXT NOT NULL,
  actor_type          TEXT NOT NULL CHECK (actor_type IN ('agent', 'human', 'system')),
  actor_principal     TEXT NOT NULL,
  action_kind         TEXT NOT NULL
    CHECK (action_kind IN ('tool_call', 'llm_invocation', 'human_approval', 'policy_decision', 'result')),
  tool_name           TEXT,
  args_hash           TEXT,
  args_redacted       JSONB,
  policy_decision     TEXT NOT NULL
    CHECK (policy_decision IN ('allow', 'deny', 'allow_with_obligation', 'allow_retro_audit')),
  policy_obligations  JSONB,
  result_status       TEXT CHECK (result_status IN ('ok', 'error', 'timeout', 'blocked')),
  output_hash         TEXT,
  sig_alg             TEXT NOT NULL DEFAULT 'ed25519',
  sig_value_b64       TEXT NOT NULL,
  chain_valid         BOOLEAN NOT NULL DEFAULT true,
  payload             JSONB,
  emitted_at          TIMESTAMPTZ NOT NULL,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, agent_id, sequence_num)
);

CREATE INDEX idx_event_org_emitted ON event (organization_id, emitted_at DESC);
CREATE INDEX idx_event_trace ON event (trace_id);
CREATE INDEX idx_trace_org ON trace (organization_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------

CREATE TABLE approval (
  approval_id         TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL REFERENCES event (event_id),
  organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  approver_user_id    UUID REFERENCES "user" (user_id),
  channel_type        TEXT NOT NULL,
  token_hash          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at          TIMESTAMPTZ,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Witness / Merkle / transparency log
-- ---------------------------------------------------------------------------

CREATE TABLE merkle_root (
  root_id         TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  root_hash       TEXT NOT NULL,
  tree_size       INT NOT NULL,
  interval_start  TIMESTAMPTZ NOT NULL,
  interval_end    TIMESTAMPTZ NOT NULL,
  sig_value_b64   TEXT,
  sig_key_id      TEXT,
  anchoring_type  TEXT CHECK (anchoring_type IN ('internal', 'bitcoin', 'ethereum')),
  external_tx_id  TEXT,
  published       BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ
);

CREATE TABLE inclusion_proof (
  proof_id        TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES event (event_id),
  root_id         TEXT NOT NULL REFERENCES merkle_root (root_id),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  merkle_path     JSONB NOT NULL,
  leaf_index      INT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transparency_log_entry (
  entry_id        TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_id        TEXT NOT NULL REFERENCES event (event_id),
  root_id         TEXT REFERENCES merkle_root (root_id),
  log_index       BIGINT NOT NULL,
  leaf_hash       TEXT NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Artifacts, exports, integrations
-- ---------------------------------------------------------------------------

CREATE TABLE artifact (
  artifact_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_id        TEXT REFERENCES event (event_id),
  storage_uri     TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  worm_locked     BOOLEAN NOT NULL DEFAULT false,
  retention_until TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance_export (
  export_id       TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  requested_by    UUID REFERENCES "user" (user_id),
  bundle_type     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'ready', 'expired')),
  storage_uri     TEXT,
  integrity_hash  TEXT,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  generated_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

CREATE TABLE siem_destination (
  dest_id         TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('splunk', 'datadog', 'sentinel')),
  otel_endpoint   TEXT,
  auth_config     JSONB,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error')),
  last_flushed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_endpoint (
  endpoint_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  secret_hash     TEXT NOT NULL,
  events_filter   JSONB,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Analytics / insurance (later phases)
-- ---------------------------------------------------------------------------

CREATE TABLE anomaly_score (
  score_id              TEXT PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  agent_id              TEXT NOT NULL REFERENCES agent (agent_id),
  action_volume_score   REAL,
  deny_rate_score       REAL,
  bypass_attempt_score  REAL,
  composite_score       REAL,
  window_start          TIMESTAMPTZ NOT NULL,
  window_end            TIMESTAMPTZ NOT NULL,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE insurance_metric (
  metric_id                 TEXT PRIMARY KEY,
  organization_id           UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  tool_risk_class           TEXT CHECK (tool_risk_class IN ('low', 'medium', 'high', 'critical')),
  action_volume             BIGINT,
  policy_deny_rate          REAL,
  approval_bypass_attempts  INT,
  anomaly_score_avg         REAL,
  epsilon                   REAL,
  window_start              TIMESTAMPTZ NOT NULL,
  window_end                TIMESTAMPTZ NOT NULL,
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Platform audit (console actions)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  user_id         UUID REFERENCES "user" (user_id),
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_org ON audit_log (organization_id, created_at DESC);

COMMIT;
