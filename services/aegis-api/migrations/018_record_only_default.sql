-- New workflows record only. Existing rows are unchanged, so demo.banking
-- workflows that already have record_only = false stay in decision mode.

ALTER TABLE governed_workflow
  ALTER COLUMN record_only SET DEFAULT true;

COMMENT ON COLUMN governed_workflow.record_only IS
  'When true, the workflow records the decision and does not enforce it. New rows default true. Demo Bank pack sets false.';
