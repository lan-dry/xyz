BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Existing accounts (pre-verification) are treated as verified
UPDATE account SET email_verified_at = COALESCE(email_verified_at, now());

CREATE TABLE email_verification_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_account ON email_verification_token (account_id, expires_at DESC);

COMMIT;
