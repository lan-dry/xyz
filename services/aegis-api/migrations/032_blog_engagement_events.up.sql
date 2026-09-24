CREATE TABLE IF NOT EXISTS blog_engagement_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  session_key  TEXT NOT NULL,
  value_num    DOUBLE PRECISION,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_engagement_events_slug_created_idx
  ON blog_engagement_events (slug, created_at DESC);

CREATE INDEX IF NOT EXISTS blog_engagement_events_event_created_idx
  ON blog_engagement_events (event_name, created_at DESC);
