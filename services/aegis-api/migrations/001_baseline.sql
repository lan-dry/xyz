-- Baseline: full Aegis + platform + web CMS schema (empty DB only).
-- Greenfield DDL — no legacy create/drop/backfill steps. Reset: DROP SCHEMA public CASCADE; pnpm db:migrate.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core: organization, identity (ADR-0006 account + membership), sessions
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan_overrides  JSONB,
  stripe_customer_id TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  billing_source  TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_source IN ('none', 'manual', 'stripe')),
  billing_status  TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_status IN ('none', 'pending', 'active', 'past_due', 'canceled')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  governance_settings  JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON COLUMN organization.billing_source IS
  'Entitlement rail: none | manual (Ops invoice) | stripe';
COMMENT ON COLUMN organization.billing_status IS
  'none | pending (invoice sent, plan still free) | active | past_due | canceled';
COMMENT ON COLUMN organization.governance_settings IS
  'Org governance: approval_ttl_hours, stale_trace_hours, notification channels';

CREATE INDEX idx_organization_stripe_customer
  ON organization (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE account (
  account_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  display_name       TEXT,
  password_hash      TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform_role      TEXT
    CHECK (platform_role IS NULL OR platform_role IN ('superadmin', 'admin', 'staff')),
  email_verified_at  TIMESTAMPTZ,
  byline_name        TEXT,
  byline_title       TEXT,
  byline_bio         TEXT,
  byline_photo_url   TEXT
);

CREATE UNIQUE INDEX idx_account_email_lower ON account (lower(email));

COMMENT ON COLUMN account.platform_role IS
  'Salanor internal Platform Ops role. NULL = customer-only account. superadmin | admin | staff.';
COMMENT ON COLUMN account.byline_name IS 'Public display name on www/research (staff byline).';
COMMENT ON COLUMN account.byline_title IS 'Public title/affiliation on www/research.';
COMMENT ON COLUMN account.byline_bio IS 'Short public bio for research attribution.';
COMMENT ON COLUMN account.byline_photo_url IS 'Optional headshot URL for research byline.';

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

CREATE TABLE session (
  session_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id              UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  account_id                 UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id            UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  token_hash                 TEXT NOT NULL UNIQUE,
  expires_at                 TIMESTAMPTZ NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  impersonator_account_id    UUID REFERENCES account (account_id) ON DELETE SET NULL,
  parent_session_id          UUID REFERENCES session (session_id) ON DELETE SET NULL,
  impersonation_started_at   TIMESTAMPTZ
);

COMMENT ON COLUMN session.impersonator_account_id IS
  'Platform staff account that started support impersonation of this session org.';

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
  key_id                   TEXT PRIMARY KEY,
  agent_id                 TEXT NOT NULL REFERENCES agent (agent_id) ON DELETE CASCADE,
  organization_id          UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  kms_provider             TEXT CHECK (kms_provider IN ('aws', 'gcp', 'azure', 'vault', 'dev')),
  kms_key_arn              TEXT,
  public_key_b64           TEXT NOT NULL,
  algorithm                TEXT NOT NULL DEFAULT 'ed25519' CHECK (algorithm = 'ed25519'),
  valid_from               TIMESTAMPTZ NOT NULL,
  valid_until              TIMESTAMPTZ,
  revoked                  BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  private_key_ciphertext   TEXT,
  bridge_enabled           BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON COLUMN signing_key.private_key_ciphertext IS
  'AES-256-GCM ciphertext of Ed25519 private key for Workflow Bridge server signing. Null for client-held keys.';
COMMENT ON COLUMN signing_key.bridge_enabled IS
  'When true, this key may be used by /v1/aegis/workflows/* to sign events server-side.';

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
  rego_source       TEXT,
  wasm_artifact_uri TEXT,
  wasm_artifact     BYTEA,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by        UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
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
    CHECK (status IN ('running', 'completed', 'failed', 'blocked', 'executing')),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  total_events    INT NOT NULL DEFAULT 0,
  denied_events   INT NOT NULL DEFAULT 0,
  approved_events INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_trace_org ON trace (organization_id, started_at DESC);

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
    CHECK (action_kind IN (
      'tool_call',
      'llm_invocation',
      'human_approval',
      'policy_decision',
      'result',
      'provenance_claim',
      'decision',
      'data_access'
    )),
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
  span_id             TEXT REFERENCES span (span_id),
  search_vector       tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(event_id, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(trace_id, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(agent_id, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(tool_name, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(payload::text, '')), 'C')
    ) STORED,
  UNIQUE (organization_id, agent_id, sequence_num)
);

CREATE INDEX idx_event_org_emitted ON event (organization_id, emitted_at DESC);
CREATE INDEX idx_event_trace ON event (trace_id);
CREATE INDEX idx_event_span ON event (span_id);
CREATE INDEX idx_event_search_vector ON event USING gin (search_vector);

-- ---------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------

CREATE TABLE approval (
  approval_id         TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL REFERENCES event (event_id),
  organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  approver_user_id    UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
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

CREATE UNIQUE INDEX uq_transparency_log_org_log_index
  ON transparency_log_entry (organization_id, log_index);

CREATE UNIQUE INDEX uq_transparency_log_org_event
  ON transparency_log_entry (organization_id, event_id);

CREATE INDEX idx_transparency_log_org_published
  ON transparency_log_entry (organization_id, published_at DESC);

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
  requested_by    UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  bundle_type     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'ready', 'expired')),
  storage_uri     TEXT,
  integrity_hash  TEXT,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  generated_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  event_count     INT,
  byte_size       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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
  user_id         UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_org ON audit_log (organization_id, created_at DESC);
-- ---------------------------------------------------------------------------
-- Auth tokens, plans, billing, integrations, ops tables
-- ---------------------------------------------------------------------------

CREATE TABLE password_reset_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_account ON password_reset_token (account_id, expires_at DESC);

CREATE TABLE email_verification_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_account ON email_verification_token (account_id, expires_at DESC);

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
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  list_price              TEXT NOT NULL DEFAULT '',
  list_price_detail       TEXT NOT NULL DEFAULT '',
  tagline                 TEXT NOT NULL DEFAULT '',
  billing_note            TEXT NOT NULL DEFAULT '',
  marketing_highlighted   BOOLEAN NOT NULL DEFAULT false
);

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
  retention_days, self_serve, sort_order,
  list_price, list_price_detail, tagline, billing_note, marketing_highlighted
) VALUES
  (
    'free', 'Free', 10000, 3, 5, 90, false, 10,
    '$0', 'forever', 'Evaluate and demo', 'Self-serve signup · no card', false
  ),
  (
    'team', 'Team', 100000, 15, 25, 365, true, 20,
    '$299', '/ month', 'Production governance', 'Billed monthly · annual discount on request', true
  ),
  (
    'enterprise', 'Enterprise', NULL, 100, 500, 2555, false, 30,
    'Custom', 'from ~$999 / mo', 'Regulated scale', 'Annual contract · invoice or PO', false
  );

-- Platform audit_log anchor + staff home org after db:seed:bootstrap (one org, no duplicate "salanor" row).
INSERT INTO organization (name, slug, plan, active)
VALUES ('Salanor Platform', 'salanor-platform', 'enterprise', false);

CREATE TABLE account_oauth (
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_subject  TEXT NOT NULL,
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  email             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX idx_account_oauth_account ON account_oauth (account_id);

CREATE TABLE organization_sso (
  organization_id        UUID PRIMARY KEY REFERENCES organization (organization_id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'workos' CHECK (provider = 'workos'),
  workos_organization_id TEXT NOT NULL,
  enabled                BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  jit_provision          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_organization_sso_workos ON organization_sso (workos_organization_id)
  WHERE enabled = true;

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
  geo_location      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_login_event_account_created
  ON account_login_event (account_id, created_at DESC);

CREATE TABLE workflow_run (
  trace_id              TEXT PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES organization (organization_id),
  agent_id              TEXT NOT NULL REFERENCES agent (agent_id),
  key_id                TEXT NOT NULL REFERENCES signing_key (key_id),
  external_system       TEXT NOT NULL DEFAULT 'n8n',
  external_workflow_id  TEXT,
  external_execution_id TEXT,
  status                TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  root_event_id         TEXT,
  business_context      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX workflow_run_org_created_idx
  ON workflow_run (organization_id, created_at DESC);

CREATE INDEX workflow_run_external_idx
  ON workflow_run (organization_id, external_system, external_execution_id)
  WHERE external_execution_id IS NOT NULL;

CREATE TABLE organization_billing_event (
  billing_event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL
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

CREATE INDEX organization_billing_event_org_created_idx
  ON organization_billing_event (organization_id, created_at DESC);

CREATE TABLE worker_run (
  run_id        TEXT PRIMARY KEY,
  worker_name   TEXT NOT NULL CHECK (worker_name IN ('witness', 'compliance', 'housekeeping')),
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,
  summary       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX idx_worker_run_name_started ON worker_run (worker_name, started_at DESC);

CREATE TABLE contact_messages (
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

CREATE INDEX contact_messages_status_created_at_idx
  ON contact_messages (status, created_at DESC);

CREATE INDEX contact_messages_created_at_idx
  ON contact_messages (created_at DESC);

CREATE TABLE marketing_blog_posts (
  id                     UUID PRIMARY KEY,
  slug                   TEXT NOT NULL UNIQUE,
  title                  TEXT NOT NULL,
  excerpt                TEXT NOT NULL DEFAULT '',
  content_html           TEXT NOT NULL DEFAULT '',
  cover_image_url        TEXT,
  author_name            TEXT NOT NULL DEFAULT 'Landry Bougang',
  author_role            TEXT,
  tags                   TEXT[] NOT NULL DEFAULT '{}',
  status                 TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  seo_title              TEXT,
  seo_description        TEXT,
  created_by_user_id     UUID REFERENCES account (account_id) ON DELETE SET NULL,
  updated_by_user_id     UUID REFERENCES account (account_id) ON DELETE SET NULL,
  published_by_user_id   UUID REFERENCES account (account_id) ON DELETE SET NULL,
  last_published_by_email TEXT
);

CREATE INDEX marketing_blog_posts_status_published_at_idx
  ON marketing_blog_posts (status, published_at DESC NULLS LAST);

CREATE INDEX marketing_blog_posts_slug_idx
  ON marketing_blog_posts (slug);

CREATE TABLE blog_engagement_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  session_key  TEXT NOT NULL,
  value_num    DOUBLE PRECISION,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX blog_engagement_events_slug_created_idx
  ON blog_engagement_events (slug, created_at DESC);

CREATE INDEX blog_engagement_events_event_created_idx
  ON blog_engagement_events (event_name, created_at DESC);


-- ========== Web CMS (Platform Ops; Prisma-aligned) ==========
-- Blog body: Git markdown. Research/careers/newsletter: Postgres.

CREATE TABLE research_posts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  dek                       TEXT NOT NULL,
  body                      TEXT NOT NULL,
  author_account_id         UUID REFERENCES account (account_id) ON DELETE SET NULL,
  published_by_account_id   UUID REFERENCES account (account_id) ON DELETE SET NULL,
  last_edited_by_account_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  track                     TEXT NOT NULL,
  published_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reading_minutes  INT NOT NULL DEFAULT 5,
  hero_image_url   TEXT,
  og_image_url     TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published'))
);

CREATE INDEX research_posts_status_published_at_idx
  ON research_posts (status, published_at DESC NULLS LAST);

CREATE INDEX research_posts_author_account_id_idx
  ON research_posts (author_account_id);

COMMENT ON COLUMN research_posts.author_account_id IS
  'Account whose byline fields appear on www/research (always the signed-in publisher).';
COMMENT ON COLUMN research_posts.published_by_account_id IS
  'Account that last set status to published (audit).';
COMMENT ON COLUMN research_posts.last_edited_by_account_id IS
  'Account that last saved this document in Platform Ops.';

CREATE TABLE open_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  team                TEXT NOT NULL,
  location            TEXT NOT NULL,
  seniority           TEXT NOT NULL,
  employment_type     TEXT NOT NULL,
  summary             TEXT NOT NULL,
  requirements        TEXT NOT NULL,
  compensation_range  TEXT,
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at           TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed'))
);

CREATE INDEX open_roles_status_posted_at_idx
  ON open_roles (status, posted_at DESC);

-- Double opt-in; soft unsubscribe (retain row for suppression — CAN-SPAM / GDPR audit).
CREATE TABLE newsletter_subscribers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at             TIMESTAMPTZ,
  confirm_token            TEXT UNIQUE,
  confirm_token_expires_at TIMESTAMPTZ,
  unsubscribe_token        TEXT UNIQUE NOT NULL,
  unsubscribed_at          TIMESTAMPTZ,
  source                   TEXT NOT NULL DEFAULT 'website',
  signup_ip_hash           TEXT,
  CONSTRAINT newsletter_subscribers_email_nonempty CHECK (char_length(trim(email)) > 0)
);

CREATE UNIQUE INDEX newsletter_subscribers_email_lower_key
  ON newsletter_subscribers (lower(trim(email)));

CREATE INDEX newsletter_subscribers_active_idx
  ON newsletter_subscribers (confirmed_at)
  WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL;

CREATE INDEX newsletter_subscribers_unsubscribed_at_idx
  ON newsletter_subscribers (unsubscribed_at)
  WHERE unsubscribed_at IS NOT NULL;

-- Newsletter broadcasts (Ops → confirmed subscribers via Resend on www).
CREATE TABLE newsletter_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT NOT NULL,
  preview_text     TEXT,
  body_html        TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  body_markdown    TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  created_by_email TEXT,
  sent_at          TIMESTAMPTZ,
  scheduled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count  INT NOT NULL DEFAULT 0,
  success_count    INT NOT NULL DEFAULT 0,
  failure_count    INT NOT NULL DEFAULT 0,
  CONSTRAINT newsletter_campaigns_subject_nonempty CHECK (char_length(trim(subject)) > 0)
);

CREATE INDEX newsletter_campaigns_created_at_idx
  ON newsletter_campaigns (created_at DESC);

CREATE INDEX newsletter_campaigns_scheduled_due_idx
  ON newsletter_campaigns (scheduled_at)
  WHERE status = 'scheduled';

CREATE TABLE newsletter_campaign_deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  subscriber_id  UUID NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message  TEXT,
  provider_id    TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, subscriber_id)
);

CREATE INDEX newsletter_campaign_deliveries_campaign_idx
  ON newsletter_campaign_deliveries (campaign_id);

COMMIT;
