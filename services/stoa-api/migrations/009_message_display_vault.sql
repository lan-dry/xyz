-- User-visible copy vs upstream redacted text; encrypted token vault for rehydration.

ALTER TABLE stoa_message
  ADD COLUMN IF NOT EXISTS content_display TEXT,
  ADD COLUMN IF NOT EXISTS redaction_vault TEXT,
  ADD COLUMN IF NOT EXISTS redaction_manifest JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN stoa_message.content IS 'Redacted text sent to the model provider and used in LLM history.';
COMMENT ON COLUMN stoa_message.content_display IS 'Original user text for workspace display (null for assistant rows).';
COMMENT ON COLUMN stoa_message.redaction_vault IS 'AES-GCM sealed JSON map of placeholder token → original span (user messages only).';
COMMENT ON COLUMN stoa_message.redaction_manifest IS 'Public proof: categories redacted before upstream send (no secret values).';
