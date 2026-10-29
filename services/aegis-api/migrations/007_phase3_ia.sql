-- Phase 3 Product IA: environments + governed workflows.

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_environment_check'
  ) THEN
    ALTER TABLE agent
      ADD CONSTRAINT agent_environment_check
      CHECK (environment IN ('production', 'sandbox'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_org_environment_idx
  ON agent (organization_id, environment);

ALTER TABLE policy
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'policy_environment_check'
  ) THEN
    ALTER TABLE policy
      ADD CONSTRAINT policy_environment_check
      CHECK (environment IN ('production', 'sandbox'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS governed_workflow (
  workflow_id       TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  environment       TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  name              TEXT NOT NULL,
  description       TEXT,
  agent_id          TEXT,
  policy_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  external_ref      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governed_workflow_org_env_idx
  ON governed_workflow (organization_id, environment);
