-- Baseline: full Aegis + platform schema (empty DB only).
-- Forward-only; reset with DROP SCHEMA public CASCADE, then pnpm db:migrate.

-- >>> 001_initial.up.sql
-- Aegis / Salanor â€” Schema v1 (initial)
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


-- >>> 002_policy_wasm.up.sql
-- Store compiled OPA WASM per policy (optional; default bundle used when null).
ALTER TABLE policy ADD COLUMN IF NOT EXISTS wasm_artifact BYTEA;


-- >>> 003_transparency_log.up.sql
-- Stage 9: transparency log integrity constraints

CREATE UNIQUE INDEX IF NOT EXISTS uq_transparency_log_org_log_index
  ON transparency_log_entry (organization_id, log_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transparency_log_org_event
  ON transparency_log_entry (organization_id, event_id);

CREATE INDEX IF NOT EXISTS idx_transparency_log_org_published
  ON transparency_log_entry (organization_id, published_at DESC);


-- >>> 004_identity_membership.up.sql
-- ADR-0006: account + membership + invitations; retire org-scoped user table
BEGIN;

CREATE TABLE account (
  account_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  display_name  TEXT,
  password_hash TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_account_email_lower ON account (lower(email));

CREATE TABLE membership (
  membership_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'engineer'
    CHECK (role IN ('admin', 'engineer', 'auditor', 'viewer')),
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ,
  UNIQUE (organization_id, account_id)
);

CREATE INDEX idx_membership_account ON membership (account_id);

CREATE TABLE organization_invitation (
  invitation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'engineer'
    CHECK (role IN ('admin', 'engineer', 'auditor', 'viewer')),
  token_hash      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by      UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitation_org_status ON organization_invitation (organization_id, status);
CREATE UNIQUE INDEX idx_invitation_org_email_pending
  ON organization_invitation (organization_id, lower(email))
  WHERE status = 'pending';

-- Backfill accounts (one per distinct email)
INSERT INTO account (account_id, email, display_name, active, created_at)
SELECT
  gen_random_uuid(),
  lower(u.email),
  max(u.display_name),
  bool_and(u.active),
  min(u.created_at)
FROM "user" u
GROUP BY lower(u.email);

-- Map legacy user_id -> membership_id (preserve UUIDs for FK stability)
INSERT INTO membership (membership_id, account_id, organization_id, role, status, joined_at, last_active_at)
SELECT
  u.user_id,
  a.account_id,
  u.organization_id,
  u.role,
  CASE WHEN u.active THEN 'active' ELSE 'suspended' END,
  u.created_at,
  u.last_login_at
FROM "user" u
JOIN account a ON lower(a.email) = lower(u.email);

-- Session: membership + account
ALTER TABLE session ADD COLUMN membership_id UUID;
ALTER TABLE session ADD COLUMN account_id UUID;

UPDATE session s
SET
  membership_id = s.user_id,
  account_id = m.account_id
FROM membership m
WHERE m.membership_id = s.user_id;

ALTER TABLE session DROP CONSTRAINT IF EXISTS session_user_id_fkey;
ALTER TABLE session DROP COLUMN user_id;
ALTER TABLE session ALTER COLUMN membership_id SET NOT NULL;
ALTER TABLE session ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE session
  ADD CONSTRAINT session_membership_id_fkey
  FOREIGN KEY (membership_id) REFERENCES membership (membership_id) ON DELETE CASCADE;
ALTER TABLE session
  ADD CONSTRAINT session_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE;

-- Repoint product FKs from user -> membership (column names unchanged)
ALTER TABLE policy DROP CONSTRAINT IF EXISTS policy_created_by_fkey;
ALTER TABLE policy
  ADD CONSTRAINT policy_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES membership (membership_id) ON DELETE SET NULL;

ALTER TABLE approval DROP CONSTRAINT IF EXISTS approval_approver_user_id_fkey;
ALTER TABLE approval
  ADD CONSTRAINT approval_approver_user_id_fkey
  FOREIGN KEY (approver_user_id) REFERENCES membership (membership_id) ON DELETE SET NULL;

ALTER TABLE compliance_export DROP CONSTRAINT IF EXISTS compliance_export_requested_by_fkey;
ALTER TABLE compliance_export
  ADD CONSTRAINT compliance_export_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES membership (membership_id) ON DELETE SET NULL;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES membership (membership_id) ON DELETE SET NULL;

DROP TABLE "user";

COMMIT;


-- >>> 005_password_reset.up.sql
BEGIN;

CREATE TABLE password_reset_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_account ON password_reset_token (account_id, expires_at DESC);

COMMIT;


-- >>> 006_compliance_export_stats.up.sql
BEGIN;

ALTER TABLE compliance_export
  ADD COLUMN IF NOT EXISTS event_count INT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT;

COMMIT;


-- >>> 007_compliance_schedule.up.sql
BEGIN;

CREATE TABLE compliance_export_schedule (
  schedule_id     TEXT PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES organization (organization_id) ON DELETE CASCADE,
  bundle_type     TEXT NOT NULL DEFAULT 'combined'
    CHECK (bundle_type IN ('soc2', 'eu_ai_act', 'combined')),
  cadence         TEXT NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('monthly')),
  enabled         BOOLEAN NOT NULL DEFAULT false,
  day_of_month    INT NOT NULL DEFAULT 1
    CHECK (day_of_month BETWEEN 1 AND 28),
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_schedule_due
  ON compliance_export_schedule (next_run_at)
  WHERE enabled = true;

COMMIT;


-- >>> 008_plan_limits_platform.up.sql
-- P1.5: plan catalog, monthly usage rollup, optional org overrides
BEGIN;

CREATE TABLE plan_catalog (
  plan_slug         TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  events_per_month  INT,
  max_ingest_keys   INT NOT NULL,
  max_members       INT NOT NULL,
  retention_days    INT NOT NULL DEFAULT 90,
  self_serve        BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  stripe_price_id   TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS plan_overrides JSONB;

CREATE TABLE organization_usage_monthly (
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  period_month    DATE NOT NULL,
  event_count     INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_month)
);

CREATE INDEX idx_org_usage_month ON organization_usage_monthly (period_month);

INSERT INTO plan_catalog (
  plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
  retention_days, self_serve, sort_order
) VALUES
  ('free', 'Free', 5000, 3, 5, 90, false, 10),
  ('team', 'Team', 50000, 10, 25, 365, true, 20),
  ('enterprise', 'Enterprise', NULL, 100, 500, 2555, false, 30)
ON CONFLICT (plan_slug) DO NOTHING;

COMMIT;


-- >>> 009_platform_staff.up.sql
-- Salanor internal staff (platform ops) â€” separate from customer org roles
BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS platform_staff BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN account.platform_staff IS
  'When true, account may use the Platform Ops app (ops.salanor.com) for cross-tenant administration.';

COMMIT;


-- >>> 010_stripe_billing.up.sql
-- Phase D: Stripe customer id on organization
BEGIN;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organization_stripe_customer
  ON organization (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMIT;


-- >>> 011_email_verification.up.sql
BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Existing accounts (pre-verification) are treated as verified
UPDATE account SET email_verified_at = COALESCE(email_verified_at, now());

CREATE TABLE email_verification_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_account ON email_verification_token (account_id, expires_at DESC);

COMMIT;


-- >>> 012_platform_roles.up.sql
-- Replace platform_staff boolean with platform_role enum (superadmin | admin | staff)
BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS platform_role TEXT
  CHECK (platform_role IS NULL OR platform_role IN ('superadmin', 'admin', 'staff'));

UPDATE account
SET platform_role = 'superadmin'
WHERE platform_staff = true AND platform_role IS NULL;

ALTER TABLE account DROP COLUMN IF EXISTS platform_staff;

COMMENT ON COLUMN account.platform_role IS
  'Salanor internal Platform Ops role. NULL = customer-only account. superadmin | admin | staff.';

COMMIT;


-- >>> 013_platform_audit_org.up.sql
-- Internal org for platform-level audit events (shown in Platform Ops audit log)
BEGIN;

INSERT INTO organization (name, slug, plan, active)
SELECT 'Salanor Platform', 'salanor-platform', 'enterprise', false
WHERE NOT EXISTS (SELECT 1 FROM organization WHERE slug = 'salanor-platform');

COMMIT;


-- >>> 014_session_impersonation.up.sql
-- Support impersonation sessions (platform staff â†’ customer console)
BEGIN;

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS impersonator_account_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES session (session_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impersonation_started_at TIMESTAMPTZ;

COMMENT ON COLUMN session.impersonator_account_id IS
  'Platform staff account that started support impersonation of this session org.';

COMMIT;


-- >>> 015_trace_root_backfill.up.sql
-- Backfill trace.root_event_id for traces created before ingest set it.
UPDATE trace t
SET root_event_id = (
  SELECT e.event_id
  FROM event e
  WHERE e.trace_id = t.trace_id
    AND e.organization_id = t.organization_id
  ORDER BY e.sequence_num ASC
  LIMIT 1
)
WHERE t.root_event_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM event e
    WHERE e.trace_id = t.trace_id
      AND e.organization_id = t.organization_id
  );


-- >>> 016_spans_search_action_kinds.up.sql
-- Formal span entity + event.span_id; extended action kinds; full-text search on events.

CREATE TABLE span (
  span_id         TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  trace_id        TEXT NOT NULL REFERENCES trace (trace_id) ON DELETE CASCADE,
  parent_span_id  TEXT REFERENCES span (span_id),
  label           TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ
);

CREATE INDEX idx_span_trace ON span (trace_id);
CREATE INDEX idx_span_org ON span (organization_id, started_at DESC);

ALTER TABLE event
  ADD COLUMN span_id TEXT REFERENCES span (span_id);

CREATE INDEX idx_event_span ON event (span_id);

ALTER TABLE event DROP CONSTRAINT IF EXISTS event_action_kind_check;
ALTER TABLE event ADD CONSTRAINT event_action_kind_check
  CHECK (action_kind IN (
    'tool_call',
    'llm_invocation',
    'human_approval',
    'policy_decision',
    'result',
    'provenance_claim',
    'decision',
    'data_access'
  ));

ALTER TABLE event
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(event_id, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(trace_id, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(agent_id, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tool_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(payload::text, '')), 'C')
  ) STORED;

CREATE INDEX idx_event_search_vector ON event USING gin (search_vector);

-- Backfill span rows from payload.span_id on existing events.
INSERT INTO span (span_id, organization_id, trace_id, label, status, started_at, ended_at)
SELECT
  NULLIF(TRIM(e.payload->>'span_id'), '') AS span_id,
  e.organization_id,
  e.trace_id,
  COALESCE(MAX(NULLIF(TRIM(e.payload->>'span_label'), '')), 'Span'),
  'closed',
  MIN(e.emitted_at),
  MAX(e.emitted_at)
FROM event e
WHERE NULLIF(TRIM(e.payload->>'span_id'), '') IS NOT NULL
GROUP BY 1, e.organization_id, e.trace_id
ON CONFLICT (span_id) DO NOTHING;

UPDATE event e
SET span_id = NULLIF(TRIM(e.payload->>'span_id'), '')
WHERE e.span_id IS NULL
  AND NULLIF(TRIM(e.payload->>'span_id'), '') IS NOT NULL;


-- >>> 017_contact_messages.up.sql
-- Marketing contact form submissions (Platform Ops /leads)
-- Idempotent: table may already exist from Prisma db push on the same DATABASE_URL.

CREATE TABLE IF NOT EXISTS contact_messages (
  id            UUID PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  organization  TEXT,
  role          TEXT,
  reason        TEXT NOT NULL,
  message       TEXT NOT NULL,
  source_path   TEXT NOT NULL DEFAULT '/contact',
  ip_hash       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  admin_notes   TEXT,
  updated_by    TEXT
);

CREATE INDEX IF NOT EXISTS contact_messages_status_created_at_idx
  ON contact_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON contact_messages (created_at DESC);


-- >>> 018_account_oauth.up.sql
-- OAuth identities linked to Salanor ID accounts (Google, GitHub)

CREATE TABLE IF NOT EXISTS account_oauth (
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_subject  TEXT NOT NULL,
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  email             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_account_oauth_account ON account_oauth (account_id);


-- >>> 019_organization_sso.up.sql
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


-- >>> 020_organization_onboarding.up.sql
-- OAuth self-serve: org created with placeholder name/slug until user completes onboarding.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE organization
SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at)
WHERE onboarding_completed_at IS NULL;


-- >>> 021_account_login_events.up.sql
CREATE TABLE account_login_event (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organization (organization_id) ON DELETE SET NULL,
  method            TEXT NOT NULL
    CHECK (method IN ('password', 'google', 'github', 'sso')),
  success           BOOLEAN NOT NULL DEFAULT true,
  failure_reason    TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_login_event_account_created
  ON account_login_event (account_id, created_at DESC);


-- >>> 022_organization_sso_jit.up.sql
-- Optional JIT: create account + membership on first successful SSO login

ALTER TABLE organization_sso
  ADD COLUMN IF NOT EXISTS jit_provision BOOLEAN NOT NULL DEFAULT false;


-- >>> 023_workflow_bridge.up.sql
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


-- >>> 024_org_billing_entitlement.up.sql
-- Manual + Stripe shared entitlement fields; Ops billing event ledger.
BEGIN;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS billing_source TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_source IN ('none', 'manual', 'stripe')),
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_status IN ('none', 'pending', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

COMMENT ON COLUMN organization.billing_source IS
  'Entitlement rail: none | manual (Ops invoice) | stripe';
COMMENT ON COLUMN organization.billing_status IS
  'none | pending (invoice sent, plan still free) | active | past_due | canceled';
COMMENT ON COLUMN organization.current_period_start IS
  'Paid entitlement period start (manual or Stripe)';
COMMENT ON COLUMN organization.current_period_end IS
  'Paid entitlement period end (manual or Stripe)';

CREATE TABLE IF NOT EXISTS organization_billing_event (
  billing_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL
    CHECK (event_type IN (
      'quote_recorded',
      'invoice_noted',
      'payment_recorded',
      'plan_activated',
      'plan_downgraded',
      'period_extended'
    )),
  plan_slug            TEXT,
  external_invoice_ref TEXT,
  amount_cents         INTEGER,
  currency             TEXT,
  period_start         TIMESTAMPTZ,
  period_end           TIMESTAMPTZ,
  note                 TEXT,
  actor_account_id     UUID REFERENCES account (account_id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_billing_event_org_created_idx
  ON organization_billing_event (organization_id, created_at DESC);

COMMIT;


-- >>> 025_org_governance_settings.up.sql
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS governance_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organization.governance_settings IS
  'Org governance: approval_ttl_hours, stale_trace_hours, notification channels';


-- >>> 026_worker_runs.up.sql
CREATE TABLE worker_run (
  run_id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL CHECK (worker_name IN ('witness', 'compliance', 'housekeeping')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX idx_worker_run_name_started ON worker_run (worker_name, started_at DESC);


-- >>> 027_trace_executing_status.up.sql
-- Post-approval trace phase: human approved, workflow side effects still running.
ALTER TABLE trace DROP CONSTRAINT IF EXISTS trace_status_check;

ALTER TABLE trace
  ADD CONSTRAINT trace_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'blocked', 'executing'));

-- Backfill: approved obligations still marked blocked â†’ executing.
UPDATE trace t
SET status = 'executing'
WHERE t.status = 'blocked'
  AND EXISTS (
    SELECT 1
    FROM approval a
    JOIN event e ON e.event_id = a.event_id AND e.organization_id = a.organization_id
    WHERE e.trace_id = t.trace_id
      AND a.organization_id = t.organization_id
      AND a.status = 'approved'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM approval a
    JOIN event e ON e.event_id = a.event_id AND e.organization_id = a.organization_id
    WHERE e.trace_id = t.trace_id
      AND a.organization_id = t.organization_id
      AND a.status = 'pending'
      AND (a.expires_at IS NULL OR a.expires_at > now())
  );


-- >>> 028_compliance_export_created_at.up.sql
-- Schema only: compliance_export.created_at for Free-tier export counting.
-- Plan limits and Stripe prices: change in Platform Ops â†’ Plans (no migration).
BEGIN;

ALTER TABLE compliance_export
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE compliance_export
SET created_at = COALESCE(generated_at, period_start)
WHERE created_at IS NULL;

ALTER TABLE compliance_export
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE compliance_export
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE compliance_export
  ALTER COLUMN created_at SET NOT NULL;

COMMIT;


-- >>> 029_account_login_geo.up.sql
-- Store best-effort city/country label at login time (from IP lookup).
ALTER TABLE account_login_event
  ADD COLUMN IF NOT EXISTS geo_location TEXT;


-- >>> 030_plan_catalog_marketing.up.sql
-- Ops-editable list prices and marketing fields (www.salanor.com/pricing reads plan_catalog).
BEGIN;

ALTER TABLE plan_catalog
  ADD COLUMN IF NOT EXISTS list_price TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS list_price_detail TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marketing_highlighted BOOLEAN NOT NULL DEFAULT false;

UPDATE plan_catalog SET
  list_price = '$0',
  list_price_detail = 'forever',
  tagline = 'Evaluate and demo',
  billing_note = 'Self-serve signup Â· no card',
  marketing_highlighted = false,
  events_per_month = 10000,
  max_ingest_keys = 3,
  max_members = 5,
  retention_days = 90
WHERE plan_slug = 'free';

UPDATE plan_catalog SET
  list_price = '$299',
  list_price_detail = '/ month',
  tagline = 'Production governance',
  billing_note = 'Billed monthly Â· annual discount on request',
  marketing_highlighted = true,
  events_per_month = 100000,
  max_ingest_keys = 15,
  max_members = 25,
  retention_days = 365
WHERE plan_slug = 'team';

UPDATE plan_catalog SET
  list_price = 'Custom',
  list_price_detail = 'from ~$999 / mo',
  tagline = 'Regulated scale',
  billing_note = 'Annual contract Â· invoice or PO',
  marketing_highlighted = false
WHERE plan_slug = 'enterprise';

COMMIT;


-- >>> 031_marketing_blog_posts.up.sql
CREATE TABLE IF NOT EXISTS marketing_blog_posts (
  id                UUID PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  excerpt           TEXT NOT NULL DEFAULT '',
  content_html      TEXT NOT NULL DEFAULT '',
  cover_image_url   TEXT,
  author_name       TEXT NOT NULL DEFAULT 'Landry Bougang',
  author_role       TEXT,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  seo_title         TEXT,
  seo_description   TEXT,
  created_by_user_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  published_by_user_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  last_published_by_email TEXT
);

CREATE INDEX IF NOT EXISTS marketing_blog_posts_status_published_at_idx
  ON marketing_blog_posts (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS marketing_blog_posts_slug_idx
  ON marketing_blog_posts (slug);


-- >>> 032_blog_engagement_events.up.sql
CREATE TABLE IF NOT EXISTS blog_engagement_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  session_key  TEXT NOT NULL,
  value_num    DOUBLE PRECISION,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_engagement_events_slug_created_idx
  ON blog_engagement_events (slug, created_at DESC);

CREATE INDEX IF NOT EXISTS blog_engagement_events_event_created_idx
  ON blog_engagement_events (event_name, created_at DESC);


