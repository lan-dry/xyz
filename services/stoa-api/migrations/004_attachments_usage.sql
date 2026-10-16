CREATE TABLE stoa_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES stoa_user(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'blocked')),
  scan_detail TEXT,
  text_extract TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stoa_attachment_tenant_user ON stoa_attachment (tenant_id, user_id, created_at DESC);

CREATE TABLE stoa_message_attachment (
  message_id UUID NOT NULL REFERENCES stoa_message(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES stoa_attachment(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE TABLE stoa_usage_monthly (
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  user_id UUID REFERENCES stoa_user(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  message_count INT NOT NULL DEFAULT 0,
  attachment_bytes BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, user_id, period_month)
);

CREATE INDEX stoa_usage_tenant_period ON stoa_usage_monthly (tenant_id, period_month);
