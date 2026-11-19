-- Demo-tenant Ops: audit non-wipe actions, assert wipeable tenants in DB, staff-readable audit.

-- action + result on the existing append-only wipe audit table (also used for create/seed/reset).
ALTER TABLE public.platform_tenant_wipe_audit
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'wipe';

ALTER TABLE public.platform_tenant_wipe_audit
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.platform_tenant_wipe_audit
  DROP CONSTRAINT IF EXISTS platform_tenant_wipe_audit_action_check;

ALTER TABLE public.platform_tenant_wipe_audit
  ADD CONSTRAINT platform_tenant_wipe_audit_action_check
  CHECK (
    action = ANY (
      ARRAY[
        'wipe'::text,
        'create'::text,
        'load_history'::text,
        'reset'::text,
        'refuse'::text
      ]
    )
  );

COMMENT ON COLUMN public.platform_tenant_wipe_audit.action IS
  'wipe | create | load_history | reset | refuse (attempt on non-demo/test)';

-- Last successful reset/seed timestamp for Ops list UI.
ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS last_demo_reset_at timestamptz;

-- ---------------------------------------------------------------------------
-- Assert tenant is wipeable (is_demo OR is_test). Raises tenant_wipe_refused.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_assert_demo_or_test(p_slug text)
RETURNS public.organization
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organization%ROWTYPE;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'tenant_wipe: slug is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_org FROM public.organization WHERE slug = btrim(p_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_wipe: no organisation with slug %', p_slug
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org.slug = 'salanor-platform' THEN
    RAISE EXCEPTION 'tenant_wipe_refused: % is the platform organisation', v_org.slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (v_org.is_demo OR v_org.is_test) THEN
    RAISE EXCEPTION 'tenant_wipe_refused: % is neither is_demo nor is_test (customer tenants are never wipeable)', v_org.slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_org;
END;
$$;

-- ---------------------------------------------------------------------------
-- Record a demo-tenant Ops action (create / load_history / reset / wipe / refuse).
-- Refuse path: still writes an audit row when the org exists but is not demo/test.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_record_demo_tenant_action(
  p_slug text,
  p_action text,
  p_actor text,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_require_demo_or_test boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organization%ROWTYPE;
  v_audit_id uuid;
  v_ok boolean := true;
  v_msg text := 'ok';
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('wipe', 'create', 'load_history', 'reset', 'refuse') THEN
    RAISE EXCEPTION 'demo_tenant_action: invalid action %', p_action
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'demo_tenant_action: actor required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_org FROM public.organization WHERE slug = btrim(p_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demo_tenant_action: no organisation with slug %', p_slug
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_require_demo_or_test AND NOT (v_org.is_demo OR v_org.is_test) THEN
    v_ok := false;
    v_msg := 'refused: neither is_demo nor is_test';
    -- Do not RAISE here: a raised exception would roll back this audit insert.
    INSERT INTO public.platform_tenant_wipe_audit (
      tenant_slug, tenant_name, tenant_organization_id, tenant_flags,
      actor, row_counts, accounts_deleted, action, result
    ) VALUES (
      v_org.slug, v_org.name, v_org.organization_id,
      jsonb_build_object('is_demo', v_org.is_demo, 'is_test', v_org.is_test),
      p_actor, '{}'::jsonb, 0, 'refuse',
      COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('ok', false, 'message', v_msg, 'requested_action', p_action)
    ) RETURNING wipe_id INTO v_audit_id;
    RETURN jsonb_build_object(
      'ok', false,
      'refused', true,
      'audit_id', v_audit_id,
      'organization_id', v_org.organization_id,
      'slug', v_org.slug,
      'action', 'refuse',
      'message', v_msg
    );
  END IF;

  IF p_action IN ('reset', 'load_history') AND v_ok THEN
    UPDATE public.organization
       SET last_demo_reset_at = now(), updated_at = now()
     WHERE organization_id = v_org.organization_id;
  END IF;

  INSERT INTO public.platform_tenant_wipe_audit (
    tenant_slug, tenant_name, tenant_organization_id, tenant_flags,
    actor, row_counts, accounts_deleted, action, result
  ) VALUES (
    v_org.slug, v_org.name, v_org.organization_id,
    jsonb_build_object('is_demo', v_org.is_demo, 'is_test', v_org.is_test),
    p_actor, '{}'::jsonb, 0, p_action,
    COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('ok', true)
  ) RETURNING wipe_id INTO v_audit_id;

  RETURN jsonb_build_object(
    'audit_id', v_audit_id,
    'organization_id', v_org.organization_id,
    'slug', v_org.slug,
    'action', p_action,
    'is_demo', v_org.is_demo,
    'is_test', v_org.is_test
  );
END;
$$;

-- Staff/app can call assert + record (wipe execute remains owner-only).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.platform_assert_demo_or_test(text) TO aegis_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.platform_record_demo_tenant_action(text, text, text, jsonb, boolean) TO aegis_app';
    -- Read-only audit for Ops list (no UPDATE/DELETE — trigger still blocks).
    EXECUTE 'GRANT SELECT ON TABLE public.platform_tenant_wipe_audit TO aegis_app';
  END IF;
END $$;
