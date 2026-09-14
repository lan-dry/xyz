-- Post-approval trace phase: human approved, workflow side effects still running.
ALTER TABLE trace DROP CONSTRAINT IF EXISTS trace_status_check;

ALTER TABLE trace
  ADD CONSTRAINT trace_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'blocked', 'executing'));

-- Backfill: approved obligations still marked blocked → executing.
UPDATE trace t
SET status = 'executing'
WHERE t.status = 'blocked'
  AND EXISTS (
    SELECT 1
    FROM approval a
    JOIN event e ON e.event_id = a.event_id AND e.organization_id = a.organization_id
    WHERE e.trace_id = t.trace_id
      AND a.organization_id = t.organization_id
      AND a.status = 'approved'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM approval a
    JOIN event e ON e.event_id = a.event_id AND e.organization_id = a.organization_id
    WHERE e.trace_id = t.trace_id
      AND a.organization_id = t.organization_id
      AND a.status = 'pending'
      AND (a.expires_at IS NULL OR a.expires_at > now())
  );
