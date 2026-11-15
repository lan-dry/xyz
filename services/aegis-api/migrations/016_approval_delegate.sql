-- Time-bound approval delegation + escalate_to_role support notes.
-- Delegates grant bank roles to a membership until expires_at.

CREATE TABLE IF NOT EXISTS approval_delegate (
  delegate_id       TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  membership_id     UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  role_key          TEXT NOT NULL,
  granted_by_membership_id UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_delegate_active
  ON approval_delegate (organization_id, membership_id, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE approval_delegate IS
  'Time-bound bank-role delegation for approvals. Guard loads non-revoked rows with expires_at > now().';

COMMENT ON COLUMN approval_delegate.role_key IS
  'Bank role key granted until expires_at (same ladder as membership_bank_role).';
