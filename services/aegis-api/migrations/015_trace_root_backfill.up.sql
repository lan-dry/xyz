-- Backfill trace.root_event_id for traces created before ingest set it.
UPDATE trace t
SET root_event_id = (
  SELECT e.event_id
  FROM event e
  WHERE e.trace_id = t.trace_id
    AND e.organization_id = t.organization_id
  ORDER BY e.sequence_num ASC
  LIMIT 1
)
WHERE t.root_event_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM event e
    WHERE e.trace_id = t.trace_id
      AND e.organization_id = t.organization_id
  );
