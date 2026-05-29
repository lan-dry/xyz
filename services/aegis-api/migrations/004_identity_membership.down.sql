-- Rollback ADR-0006 (dev only — loses invitation rows)
BEGIN;

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

INSERT INTO "user" (user_id, organization_id, email, display_name, role, active, created_at, last_login_at)
SELECT
  m.membership_id,
  m.organization_id,
  a.email,
  a.display_name,
  m.role,
  m.status = 'active',
  m.joined_at,
  m.last_active_at
FROM membership m
JOIN account a ON a.account_id = m.account_id;

ALTER TABLE session ADD COLUMN user_id UUID;

UPDATE session s
SET user_id = s.membership_id;

ALTER TABLE session DROP CONSTRAINT IF EXISTS session_membership_id_fkey;
ALTER TABLE session DROP CONSTRAINT IF EXISTS session_account_id_fkey;
ALTER TABLE session DROP COLUMN membership_id;
ALTER TABLE session DROP COLUMN account_id;
ALTER TABLE session ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE session
  ADD CONSTRAINT session_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user" (user_id) ON DELETE CASCADE;

ALTER TABLE policy DROP CONSTRAINT IF EXISTS policy_created_by_fkey;
ALTER TABLE policy
  ADD CONSTRAINT policy_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES "user" (user_id) ON DELETE SET NULL;

ALTER TABLE approval DROP CONSTRAINT IF EXISTS approval_approver_user_id_fkey;
ALTER TABLE approval
  ADD CONSTRAINT approval_approver_user_id_fkey
  FOREIGN KEY (approver_user_id) REFERENCES "user" (user_id) ON DELETE SET NULL;

ALTER TABLE compliance_export DROP CONSTRAINT IF EXISTS compliance_export_requested_by_fkey;
ALTER TABLE compliance_export
  ADD CONSTRAINT compliance_export_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES "user" (user_id) ON DELETE SET NULL;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user" (user_id) ON DELETE SET NULL;

DROP TABLE organization_invitation;
DROP TABLE membership;
DROP TABLE account;

COMMIT;
