-- Idempotent: greenfield 001_baseline already has these columns.
-- Hosted DBs that predate the squash, or drifted grants/schema, get them here.
ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false NOT NULL;

ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS public.organization_usage_monthly (
  organization_id uuid NOT NULL REFERENCES public.organization (organization_id) ON DELETE CASCADE,
  period_month date NOT NULL,
  event_count bigint DEFAULT 0 NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (organization_id, period_month)
);
