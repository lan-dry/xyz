ALTER TABLE stoa_tenant
  ADD COLUMN IF NOT EXISTS platform_organization_id UUID UNIQUE;

ALTER TABLE stoa_user
  ADD COLUMN IF NOT EXISTS platform_account_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS stoa_user_tenant_account
  ON stoa_user (tenant_id, platform_account_id)
  WHERE platform_account_id IS NOT NULL;
