-- Ensure org teardown cascades workflow_run (was missing ON DELETE CASCADE).
ALTER TABLE workflow_run
  DROP CONSTRAINT IF EXISTS workflow_run_organization_id_fkey;

ALTER TABLE workflow_run
  ADD CONSTRAINT workflow_run_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES organization (organization_id)
  ON DELETE CASCADE;
