BEGIN;

CREATE TABLE password_reset_token (
  token_hash   TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_account ON password_reset_token (account_id, expires_at DESC);

COMMIT;
