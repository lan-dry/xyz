-- Phase 5 Proof: incidents, score bands, auditor invites, policy simulate cache.

CREATE TABLE IF NOT EXISTS incident (
  incident_id       TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  environment       TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  title             TEXT NOT NULL,
  severity          TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  summary           TEXT,
  trace_id          TEXT,
  event_id          TEXT,
  workflow_id       TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS incident_org_env_idx
  ON incident (organization_id, environment, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_note (
  note_id           TEXT PRIMARY KEY,
  incident_id       TEXT NOT NULL REFERENCES incident (incident_id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  author_user_id    UUID,
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_note_incident_idx
  ON incident_note (incident_id, created_at ASC);

-- Customer maps risk_score → Allow / Ask a person / Stop (§12.3).
CREATE TABLE IF NOT EXISTS score_band (
  band_id           TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  environment       TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  name              TEXT NOT NULL,
  min_score         NUMERIC NOT NULL,
  max_score         NUMERIC NOT NULL,
  decision          TEXT NOT NULL
    CHECK (decision IN ('allow', 'allow_with_obligation', 'deny')),
  require_four_eyes BOOLEAN NOT NULL DEFAULT false,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_score <= max_score)
);

CREATE INDEX IF NOT EXISTS score_band_org_env_idx
  ON score_band (organization_id, environment, sort_order);

-- Stale / missing signal fallback (§12.5).
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS signal_fallback TEXT NOT NULL DEFAULT 'allow_with_obligation'
    CHECK (signal_fallback IN ('allow', 'allow_with_obligation', 'deny'));

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS signal_stale_hours INT NOT NULL DEFAULT 24;

-- Auditor portal invites (scoped read-only).
CREATE TABLE IF NOT EXISTS auditor_invite (
  invite_id         TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  token_hash        TEXT NOT NULL,
  workflow_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auditor_access_log (
  log_id            TEXT PRIMARY KEY,
  invite_id         TEXT NOT NULL REFERENCES auditor_invite (invite_id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  resource_type     TEXT,
  resource_id       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
