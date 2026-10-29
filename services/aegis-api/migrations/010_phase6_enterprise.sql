-- Phase 6 Enterprise: legal hold, retention purge support, role expansion, key rotation log.

-- Org-wide legal hold freezes retention purge for every event in the org.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization.legal_hold IS
  'When true, retention purge skips all events/artifacts for this organization.';

-- Per-event legal hold (case / litigation hold).
ALTER TABLE event
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE event
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

COMMENT ON COLUMN event.legal_hold IS
  'When true, retention purge never redacts or deletes this event.';
COMMENT ON COLUMN event.purged_at IS
  'Soft retention: payload redacted after retention window when not on legal hold.';

CREATE INDEX IF NOT EXISTS idx_event_org_purge
  ON event (organization_id, emitted_at)
  WHERE purged_at IS NULL AND legal_hold = false;

-- Expand org roles: Owner / Approver / Developer (engineer kept as alias).
ALTER TABLE membership DROP CONSTRAINT IF EXISTS membership_role_check;
ALTER TABLE membership
  ADD CONSTRAINT membership_role_check
  CHECK (role IN ('owner', 'admin', 'approver', 'engineer', 'developer', 'auditor', 'viewer'));

ALTER TABLE organization_invitation DROP CONSTRAINT IF EXISTS organization_invitation_role_check;
ALTER TABLE organization_invitation
  ADD CONSTRAINT organization_invitation_role_check
  CHECK (role IN ('owner', 'admin', 'approver', 'engineer', 'developer', 'auditor', 'viewer'));

-- Signing key rotation history (who/when/old→new).
CREATE TABLE IF NOT EXISTS signing_key_rotation (
  rotation_id       TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  agent_id          TEXT NOT NULL REFERENCES agent (agent_id) ON DELETE CASCADE,
  previous_key_id   TEXT REFERENCES signing_key (key_id) ON DELETE SET NULL,
  new_key_id        TEXT NOT NULL REFERENCES signing_key (key_id) ON DELETE CASCADE,
  reason            TEXT,
  actor_membership_id UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signing_key_rotation_org
  ON signing_key_rotation (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signing_key_rotation_agent
  ON signing_key_rotation (agent_id, created_at DESC);
