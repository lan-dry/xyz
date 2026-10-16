-- Scheduled retention dedupe + gateway service account credentials

CREATE TABLE IF NOT EXISTS stoa_retention_schedule_run (
  tenant_id UUID PRIMARY KEY REFERENCES stoa_tenant (id) ON DELETE CASCADE,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stoa_gateway_credential (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES stoa_user (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS stoa_gateway_credential_key_hash_active
  ON stoa_gateway_credential (key_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS stoa_gateway_credential_tenant
  ON stoa_gateway_credential (tenant_id)
  WHERE revoked_at IS NULL;
