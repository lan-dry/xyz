-- Platform-held sandbox test-sender key. Ciphertext only; never returned to the browser.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS sandbox_source_secret text;
