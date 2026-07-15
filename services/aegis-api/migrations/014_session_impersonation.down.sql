BEGIN;

ALTER TABLE session
  DROP COLUMN IF EXISTS impersonation_started_at,
  DROP COLUMN IF EXISTS parent_session_id,
  DROP COLUMN IF EXISTS impersonator_account_id;

COMMIT;
