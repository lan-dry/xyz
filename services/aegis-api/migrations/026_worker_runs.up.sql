CREATE TABLE worker_run (
  run_id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL CHECK (worker_name IN ('witness', 'compliance', 'housekeeping')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX idx_worker_run_name_started ON worker_run (worker_name, started_at DESC);
