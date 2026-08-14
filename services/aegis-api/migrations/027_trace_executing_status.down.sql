UPDATE trace SET status = 'blocked' WHERE status = 'executing';

ALTER TABLE trace DROP CONSTRAINT IF EXISTS trace_status_check;

ALTER TABLE trace
  ADD CONSTRAINT trace_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'blocked'));
