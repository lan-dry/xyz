ALTER TABLE stoa_tenant
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
    "enabledModelIds": ["gpt-4o-mini", "gpt-4o"],
    "dlp": { "email": true, "phone": true }
  }'::jsonb;
