-- dbdiagram.io: Import > PostgreSQL (or paste below)
-- Source: 001_baseline.sql (CREATE TABLE only, simplified)

CREATE TABLE organization (
  organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',
  region          TEXT NOT NULL DEFAULT 'us-east',
  topology        TEXT NOT NULL DEFAULT 'cloud',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan_overrides  JSONB,
  stripe_customer_id TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  billing_source  TEXT NOT NULL DEFAULT 'none',
  billing_status  TEXT NOT NULL DEFAULT 'none',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  governance_settings  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE account (
  account_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  display_name       TEXT,
  password_hash      TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform_role      TEXT,
  email_verified_at  TIMESTAMPTZ,
  byline_name        TEXT,
  byline_title       TEXT,
  byline_bio         TEXT,
  byline_photo_url   TEXT
);

CREATE TABLE membership (
  membership_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'engineer',
  status          TEXT NOT NULL DEFAULT 'active',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ,
  UNIQUE (organization_id, account_id)
);

CREATE TABLE organization_invitation (
  invitation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'engineer',
  token_hash      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',
  invited_by      UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE idempotency_record (
  organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key)
);

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

CREATE TABLE did_document (
  did_document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT NOT NULL REFERENCES agent (agent_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  document_json   JSONB NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy (
  policy_id       TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  version         INT NOT NULL,
  rego_source       TEXT,
  wasm_artifact_uri TEXT,
  wasm_artifact     BYTEA,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_by        UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  activated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy_rule (
  rule_id       TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policy (policy_id) ON DELETE CASCADE,
  tool_pattern  TEXT NOT NULL,
  decision      TEXT NOT NULL,
  conditions    JSONB,
  obligations   JSONB,
  priority      INT NOT NULL DEFAULT 0
);

CREATE TABLE approval_channel (
  channel_id      TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  config          JSONB,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trace (
  trace_id        TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL REFERENCES agent (agent_id),
  root_event_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'running',
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  total_events    INT NOT NULL DEFAULT 0,
  denied_events   INT NOT NULL DEFAULT 0,
  approved_events INT NOT NULL DEFAULT 0
);

CREATE TABLE span (
  span_id         TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  trace_id        TEXT NOT NULL REFERENCES trace (trace_id) ON DELETE CASCADE,
  parent_span_id  TEXT REFERENCES span (span_id),
  label           TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ
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
  action_kind         TEXT NOT NULL,
  tool_name           TEXT,
  args_hash           TEXT,
  args_redacted       JSONB,
  policy_decision     TEXT NOT NULL,
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
  search_vector       tsvector,
      setweight(to_tsvector('simple', coalesce(event_id, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(trace_id, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(agent_id, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(tool_name, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(payload::text, '')), 'C')
    ) STORED,
  UNIQUE (organization_id, agent_id, sequence_num)
);

CREATE TABLE approval (
  approval_id         TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL REFERENCES event (event_id),
  organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  approver_user_id    UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  channel_type        TEXT NOT NULL,
  token_hash          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  expires_at          TIMESTAMPTZ,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  status          TEXT NOT NULL DEFAULT 'pending',
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
  status          TEXT NOT NULL DEFAULT 'active',
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

CREATE TABLE password_reset_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance_export_schedule (
  schedule_id     TEXT PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES organization (organization_id) ON DELETE CASCADE,
  bundle_type     TEXT NOT NULL DEFAULT 'combined',
  cadence         TEXT NOT NULL DEFAULT 'monthly',
  enabled         BOOLEAN NOT NULL DEFAULT false,
  day_of_month    INT NOT NULL DEFAULT 1,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE account_oauth (
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_subject  TEXT NOT NULL,
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  email             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE TABLE organization_sso (
  organization_id        UUID PRIMARY KEY REFERENCES organization (organization_id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'workos' CHECK (provider = 'workos'),
  workos_organization_id TEXT NOT NULL,
  enabled                BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  jit_provision          BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE account_login_event (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organization (organization_id) ON DELETE SET NULL,
  method            TEXT NOT NULL,
  success           BOOLEAN NOT NULL DEFAULT true,
  failure_reason    TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  geo_location      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_run (
  trace_id              TEXT PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES organization (organization_id),
  agent_id              TEXT NOT NULL REFERENCES agent (agent_id),
  key_id                TEXT NOT NULL REFERENCES signing_key (key_id),
  external_system       TEXT NOT NULL DEFAULT 'n8n',
  external_workflow_id  TEXT,
  external_execution_id TEXT,
  status                TEXT NOT NULL DEFAULT 'running',
  root_event_id         TEXT,
  business_context      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);

CREATE TABLE organization_billing_event (
  billing_event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL,
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
  status        TEXT NOT NULL DEFAULT 'new',
  admin_notes   TEXT,
  updated_by    TEXT
);

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
  status                 TEXT NOT NULL DEFAULT 'draft',
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

CREATE TABLE blog_engagement_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  session_key  TEXT NOT NULL,
  value_num    DOUBLE PRECISION,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  status           TEXT NOT NULL DEFAULT 'draft',
);

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
  status              TEXT NOT NULL DEFAULT 'draft',
);

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
);

CREATE TABLE newsletter_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT NOT NULL,
  preview_text     TEXT,
  body_html        TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  body_markdown    TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  created_by_email TEXT,
  sent_at          TIMESTAMPTZ,
  scheduled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count  INT NOT NULL DEFAULT 0,
  success_count    INT NOT NULL DEFAULT 0,
  failure_count    INT NOT NULL DEFAULT 0,
);

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
