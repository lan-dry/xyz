CREATE TABLE account_login_event (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES account (account_id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organization (organization_id) ON DELETE SET NULL,
  method            TEXT NOT NULL
    CHECK (method IN ('password', 'google', 'github', 'sso')),
  success           BOOLEAN NOT NULL DEFAULT true,
  failure_reason    TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_login_event_account_created
  ON account_login_event (account_id, created_at DESC);
