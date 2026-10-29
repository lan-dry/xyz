-- Phase 8: expiring read-only share-receipt tokens.

CREATE TABLE IF NOT EXISTS receipt_share_token (
  share_id          TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_id          TEXT NOT NULL,
  token_hash        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ,
  last_accessed_at  TIMESTAMPTZ,
  access_count      INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_share_token_hash_uidx
  ON receipt_share_token (token_hash);

CREATE INDEX IF NOT EXISTS receipt_share_token_org_event_idx
  ON receipt_share_token (organization_id, event_id, created_at DESC);

COMMENT ON TABLE receipt_share_token IS
  'Read-only receipt share links; opaque token hashed at rest; expires or revoke.';
