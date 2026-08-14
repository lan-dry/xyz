DROP INDEX IF EXISTS workflow_run_external_idx;
DROP INDEX IF EXISTS workflow_run_org_created_idx;
DROP TABLE IF EXISTS workflow_run;

ALTER TABLE signing_key
  DROP COLUMN IF EXISTS bridge_enabled,
  DROP COLUMN IF EXISTS private_key_ciphertext;
