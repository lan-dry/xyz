-- Console "Reset sandbox": wipe synthetic events/cases/approvals/evidence for a
-- sandbox org while keeping the organisation row and active memberships.
-- Distinct from platform_wipe_tenant (Ops), which deletes the whole tenant.

CREATE OR REPLACE FUNCTION public.platform_reset_sandbox(
  p_organization_id uuid,
  p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org          public.organization%ROWTYPE;
  v_tables       text[] := public.platform_tenant_wipe_tables();
  v_keep         text[] := ARRAY[
    'membership',
    'session',
    'account_login_event',
    'organization_sso',
    'organization_scim',
    'organization_scim_group',
    'organization_scim_group_member'
  ];
  v_t            text;
  v_n            bigint;
  v_counts       jsonb := '{}'::jsonb;
  v_trg_tables   text[] := ARRAY[]::text[];
  v_trg_names    text[] := ARRAY[]::text[];
  v_i            int;
  v_rec          record;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'sandbox_reset: organization_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'sandbox_reset: an actor is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_org
    FROM public.organization
   WHERE organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sandbox_reset: organisation not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF COALESCE(v_org.tenant_kind, 'real') <> 'sandbox' THEN
    RAISE EXCEPTION 'sandbox_reset_refused: % is not a sandbox (tenant_kind=%)',
      v_org.slug, COALESCE(v_org.tenant_kind, 'real')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Count rows that will be cleared (skip keep-list).
  FOREACH v_t IN ARRAY v_tables LOOP
    IF v_t = ANY (v_keep) THEN
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_t)
        INTO v_n USING p_organization_id;
      IF v_n > 0 THEN
        v_counts := v_counts || jsonb_build_object(v_t, v_n);
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;
  END LOOP;

  -- Disable append-only triggers on wipe tables for this transaction only.
  FOR v_rec IN
    SELECT c.relname::text AS rel, t.tgname::text AS trg
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND NOT t.tgisinternal
       AND t.tgenabled = 'O'
       AND t.tgname LIKE 'trg\_%\_append\_only'
       AND c.relname::text = ANY (v_tables)
       AND c.relname::text <> ALL (v_keep)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_rec.rel, v_rec.trg);
    v_trg_tables := v_trg_tables || v_rec.rel;
    v_trg_names  := v_trg_names  || v_rec.trg;
  END LOOP;

  FOREACH v_t IN ARRAY v_tables LOOP
    IF v_t = ANY (v_keep) THEN
      CONTINUE;
    END IF;
    BEGIN
      IF v_t = 'policy' THEN
        DELETE FROM public.policy_rule
         WHERE policy_id IN (
           SELECT policy_id FROM public.policy WHERE organization_id = p_organization_id
         );
      END IF;
      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_t)
        USING p_organization_id;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;
  END LOOP;

  FOR v_i IN 1 .. COALESCE(cardinality(v_trg_tables), 0) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', v_trg_tables[v_i], v_trg_names[v_i]);
  END LOOP;

  -- Fresh onboarding + 30-day clock; keep tenant_kind = sandbox.
  UPDATE public.organization
     SET onboarding_checklist = '{}'::jsonb,
         sandbox_expires_at = now() + interval '30 days',
         governance_settings = COALESCE(governance_settings, '{}'::jsonb) - 'applied_pack'
   WHERE organization_id = p_organization_id;

  INSERT INTO public.platform_sandbox_audit (organization_id, action, actor, detail)
  VALUES (
    p_organization_id,
    'reset',
    p_actor,
    jsonb_build_object('row_counts', v_counts, 'slug', v_org.slug)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'slug', v_org.slug,
    'row_counts', v_counts
  );
END;
$$;

COMMENT ON FUNCTION public.platform_reset_sandbox(uuid, text) IS
  'Clear sandbox synthetic data (events, cases, approvals, evidence). Keeps org + memberships. Refuses non-sandbox.';

-- Console app may call this; full platform_wipe_tenant stays owner-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.platform_reset_sandbox(uuid, text) TO aegis_app';
  END IF;
END
$$;
