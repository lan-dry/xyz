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
