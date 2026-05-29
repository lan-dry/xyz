-- Support impersonation sessions (platform staff → customer console)
BEGIN;

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS impersonator_account_id UUID REFERENCES account (account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES session (session_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impersonation_started_at TIMESTAMPTZ;

COMMENT ON COLUMN session.impersonator_account_id IS
  'Platform staff account that started support impersonation of this session org.';

COMMIT;
