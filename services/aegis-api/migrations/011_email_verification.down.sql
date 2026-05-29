BEGIN;

DROP TABLE IF EXISTS email_verification_token;
ALTER TABLE account DROP COLUMN IF EXISTS email_verified_at;

COMMIT;
