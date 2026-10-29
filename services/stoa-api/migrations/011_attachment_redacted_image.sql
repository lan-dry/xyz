-- Cleaned image preview after OCR + pixel redaction (original stays in storage_path).
ALTER TABLE stoa_attachment
  ADD COLUMN IF NOT EXISTS redacted_storage_path TEXT;
