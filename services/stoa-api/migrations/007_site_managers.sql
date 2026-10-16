CREATE TABLE stoa_site_manager (
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES stoa_site(id) ON DELETE CASCADE,
  stoa_user_id UUID NOT NULL REFERENCES stoa_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, stoa_user_id)
);

CREATE INDEX stoa_site_manager_user_idx
  ON stoa_site_manager (tenant_id, stoa_user_id);
