-- Stage 2–3: sandbox tenant kind, quotas, expiry, access requests, onboarding checklist.

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'real';

UPDATE organization
   SET tenant_kind = CASE
     WHEN is_demo THEN 'demo'
     WHEN is_test THEN 'sandbox'
     ELSE 'real'
   END
 WHERE tenant_kind = 'real'
   AND (is_demo OR is_test);

ALTER TABLE organization
  DROP CONSTRAINT IF EXISTS organization_tenant_kind_check;

ALTER TABLE organization
  ADD CONSTRAINT organization_tenant_kind_check
  CHECK (tenant_kind = ANY (ARRAY['real'::text, 'demo'::text, 'sandbox'::text]));

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS sandbox_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS sandbox_extensions int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sandbox_read_only_until timestamptz,
  ADD COLUMN IF NOT EXISTS sandbox_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_quota_daily int,
  ADD COLUMN IF NOT EXISTS storage_quota_mb int,
  ADD COLUMN IF NOT EXISTS onboarding_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Sandbox defaults: 30-day expiry, modest quotas.
UPDATE organization
   SET sandbox_expires_at = COALESCE(sandbox_expires_at, now() + interval '30 days'),
       event_quota_daily = COALESCE(event_quota_daily, 5000),
       storage_quota_mb = COALESCE(storage_quota_mb, 512)
 WHERE tenant_kind = 'sandbox'
   AND sandbox_archived_at IS NULL;

CREATE TABLE IF NOT EXISTS sandbox_access_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_email text NOT NULL,
  company text NOT NULL,
  role_title text NOT NULL,
  country text NOT NULL,
  use_case text NOT NULL,
  org_type text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  honeypot text,
  ip_hash text,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_organization_id uuid REFERENCES organization (organization_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandbox_access_request_status_idx
  ON sandbox_access_request (status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_sandbox_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  action text NOT NULL,
  actor text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_sandbox_audit_org_idx
  ON platform_sandbox_audit (organization_id, created_at DESC);

-- Extend wipe: sandbox tenants are wipeable like is_test.
CREATE OR REPLACE FUNCTION platform_assert_tenant_wipeable(p_slug text)
RETURNS organization
LANGUAGE plpgsql
AS $$
DECLARE
  v_org organization%ROWTYPE;
BEGIN
  SELECT * INTO v_org FROM organization WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_wipe_refused: unknown slug %', p_slug
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT (v_org.is_demo OR v_org.is_test OR v_org.tenant_kind = 'sandbox') THEN
    RAISE EXCEPTION 'tenant_wipe_refused: % is not demo, test, or sandbox (customer tenants are never wipeable)', v_org.slug
      USING ERRCODE = 'P0001';
  END IF;
  RETURN v_org;
END;
$$;
