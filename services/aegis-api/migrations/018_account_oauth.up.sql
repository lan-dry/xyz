-- OAuth identities linked to Salanor ID accounts (Google, GitHub)

CREATE TABLE IF NOT EXISTS account_oauth (
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_subject  TEXT NOT NULL,
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  email             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_account_oauth_account ON account_oauth (account_id);
