-- Phase 2 Control: dual-approver votes, ask-more/reassign metadata, two-person policy activate.

ALTER TABLE approval
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE approval DROP CONSTRAINT IF EXISTS approval_status_check;

ALTER TABLE approval
  ADD CONSTRAINT approval_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'needs_info'));

CREATE TABLE IF NOT EXISTS approval_vote (
  vote_id           TEXT PRIMARY KEY,
  approval_id       TEXT NOT NULL REFERENCES approval (approval_id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  voter_user_id     UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  voter_email       TEXT,
  decision          TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (approval_id, voter_user_id)
);

CREATE INDEX IF NOT EXISTS approval_vote_approval_idx
  ON approval_vote (organization_id, approval_id);

CREATE TABLE IF NOT EXISTS policy_activation_request (
  request_id          TEXT PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  policy_id           TEXT NOT NULL,
  requested_by        UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  confirmed_by        UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'activated', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS policy_activation_request_org_idx
  ON policy_activation_request (organization_id, status);
