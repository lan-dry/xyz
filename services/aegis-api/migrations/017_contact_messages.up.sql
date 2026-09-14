-- Marketing contact form submissions (Platform Ops /leads)
-- Idempotent: table may already exist from Prisma db push on the same DATABASE_URL.

CREATE TABLE IF NOT EXISTS contact_messages (
  id            UUID PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  organization  TEXT,
  role          TEXT,
  reason        TEXT NOT NULL,
  message       TEXT NOT NULL,
  source_path   TEXT NOT NULL DEFAULT '/contact',
  ip_hash       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  admin_notes   TEXT,
  updated_by    TEXT
);

CREATE INDEX IF NOT EXISTS contact_messages_status_created_at_idx
  ON contact_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON contact_messages (created_at DESC);
