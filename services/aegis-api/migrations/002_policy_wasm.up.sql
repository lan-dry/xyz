-- Store compiled OPA WASM per policy (optional; default bundle used when null).
ALTER TABLE policy ADD COLUMN IF NOT EXISTS wasm_artifact BYTEA;
