CREATE TABLE stoa_site (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, name)
);

CREATE INDEX stoa_site_tenant ON stoa_site (tenant_id, name);

ALTER TABLE stoa_user
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES stoa_site(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stoa_user_site_idx ON stoa_user (tenant_id, site_id);
