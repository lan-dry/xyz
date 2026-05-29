-- Formal span entity + event.span_id; extended action kinds; full-text search on events.

CREATE TABLE span (
  span_id         TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  trace_id        TEXT NOT NULL REFERENCES trace (trace_id) ON DELETE CASCADE,
  parent_span_id  TEXT REFERENCES span (span_id),
  label           TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ
);

CREATE INDEX idx_span_trace ON span (trace_id);
CREATE INDEX idx_span_org ON span (organization_id, started_at DESC);

ALTER TABLE event
  ADD COLUMN span_id TEXT REFERENCES span (span_id);

CREATE INDEX idx_event_span ON event (span_id);

ALTER TABLE event DROP CONSTRAINT IF EXISTS event_action_kind_check;
ALTER TABLE event ADD CONSTRAINT event_action_kind_check
  CHECK (action_kind IN (
    'tool_call',
    'llm_invocation',
    'human_approval',
    'policy_decision',
    'result',
    'provenance_claim',
    'decision',
    'data_access'
  ));

ALTER TABLE event
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(event_id, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(trace_id, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(agent_id, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tool_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(payload::text, '')), 'C')
  ) STORED;

CREATE INDEX idx_event_search_vector ON event USING gin (search_vector);

-- Backfill span rows from payload.span_id on existing events.
INSERT INTO span (span_id, organization_id, trace_id, label, status, started_at, ended_at)
SELECT
  NULLIF(TRIM(e.payload->>'span_id'), '') AS span_id,
  e.organization_id,
  e.trace_id,
  COALESCE(MAX(NULLIF(TRIM(e.payload->>'span_label'), '')), 'Span'),
  'closed',
  MIN(e.emitted_at),
  MAX(e.emitted_at)
FROM event e
WHERE NULLIF(TRIM(e.payload->>'span_id'), '') IS NOT NULL
GROUP BY 1, e.organization_id, e.trace_id
ON CONFLICT (span_id) DO NOTHING;

UPDATE event e
SET span_id = NULLIF(TRIM(e.payload->>'span_id'), '')
WHERE e.span_id IS NULL
  AND NULLIF(TRIM(e.payload->>'span_id'), '') IS NOT NULL;
