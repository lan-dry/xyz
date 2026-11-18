-- Baseline: full Aegis + platform + web CMS schema (empty DB only).
-- Single greenfield migration — final table/function definitions, no upgrade ALTERs.
-- Reset: DROP SCHEMA public CASCADE; CREATE SCHEMA public; pnpm db:migrate.

BEGIN;

-- Functions are created before tables (pg_dump order); defer body validation until commit.
SET LOCAL check_function_bodies = false;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: aegis_forbid_event_seal_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aegis_forbid_event_seal_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append_only: sealed event rows cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Seal identity + hash chain only. Payload may be redacted (retention);
  -- sig may be refreshed by legacy resign paths. event_hash/sequence stay fixed.
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
     OR NEW.event_hash IS DISTINCT FROM OLD.event_hash
     OR NEW.sequence_num IS DISTINCT FROM OLD.sequence_num
     OR NEW.prev_event_hash IS DISTINCT FROM OLD.prev_event_hash
  THEN
    RAISE EXCEPTION 'append_only: sealed event identity/hash chain fields are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: aegis_forbid_receipt_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aegis_forbid_receipt_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append_only: forensic receipts cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'append_only: forensic receipts cannot be updated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: platform_tenant_wipe_audit_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_tenant_wipe_audit_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'append_only: platform_tenant_wipe_audit rows cannot be updated or deleted'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

--
-- Name: platform_tenant_wipe_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT ARRAY[
    'receipt_access_log',
    'forensic_receipt_timestamp',
    'forensic_receipt',
    'forensic_checkpoint',
    'forensic_receipt_seq',
    'sensitive_field_vault',
    'bank_case',
    'membership_bank_role',
    'authority_matrix',
    'bank_role_ladder',
    'field_policy',
    'approval_vote',
    'approval_delegate',
    'approval',
    'inclusion_proof',
    'transparency_log_entry',
    'artifact',
    'event',
    'span',
    'trace',
    'workflow_run',
    'anomaly_score',
    'insurance_metric',
    'merkle_root',
    'signed_event_buffer',
    'governed_workflow',
    'idempotency_record',
    'auditor_access_log',
    'auditor_invite',
    'incident_note',
    'incident',
    'score_band',
    'receipt_share_token',
    'policy_activation_request',
    'policy_publish_approval',
    'policy',
    'signing_key_rotation',
    'did_document',
    'signing_key',
    'agent',
    'approval_channel',
    'ingest_api_key',
    'session',
    'organization_invitation',
    'organization_scim_group_member',
    'organization_scim_group',
    'organization_scim',
    'organization_sso',
    'membership',
    'audit_log',
    'account_login_event',
    'compliance_export',
    'compliance_export_schedule',
    'organization_usage_monthly',
    'organization_billing_event',
    'siem_destination',
    'webhook_endpoint'
  ]::text[];
$$;

--
-- Name: platform_wipe_tenant(text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_wipe_tenant(p_slug text, p_execute boolean DEFAULT false, p_actor text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_org          public.organization%ROWTYPE;
  v_tables       text[] := public.platform_tenant_wipe_tables();
  v_t            text;
  v_n            bigint;
  v_counts       jsonb := '{}'::jsonb;
  v_accounts     uuid[];
  v_accounts_del bigint := 0;
  v_kept         bigint := 0;
  v_trg_tables   text[] := ARRAY[]::text[];
  v_trg_names    text[] := ARRAY[]::text[];
  v_i            int;
  v_rec          record;
  v_audit_id     uuid;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'tenant_wipe: slug is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_org FROM public.organization WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_wipe: no organisation with slug %', p_slug
      USING ERRCODE = 'no_data_found';
  END IF;

  -- GUARD 1: only demo or test tenants. Real customer tenants are never wipeable.
  IF v_org.slug = 'salanor-platform' THEN
    RAISE EXCEPTION 'tenant_wipe_refused: % is the platform organisation', v_org.slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (v_org.is_demo OR v_org.is_test) THEN
    RAISE EXCEPTION 'tenant_wipe_refused: % is neither is_demo nor is_test (customer tenants are never wipeable)', v_org.slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_execute THEN
    IF p_actor IS NULL OR btrim(p_actor) = '' THEN
      RAISE EXCEPTION 'tenant_wipe: an actor is required to record the wipe'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- Serialise concurrent wipes and block flag changes while we work.
    PERFORM 1 FROM public.organization WHERE organization_id = v_org.organization_id FOR UPDATE;
    -- Re-check the flags under the lock.
    SELECT * INTO v_org FROM public.organization WHERE organization_id = v_org.organization_id;
    IF NOT FOUND OR NOT (v_org.is_demo OR v_org.is_test) THEN
      RAISE EXCEPTION 'tenant_wipe_refused: % lost its is_demo/is_test flag', p_slug
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- GUARD 2: a tenant-scoped table that is not in the allowlist and holds this tenant's rows
  -- would be silently skipped (or wiped by cascade): refuse loudly instead.
  FOR v_t IN
    SELECT c.relname::text
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND a.attname = 'organization_id'
       AND NOT a.attisdropped
       AND c.relname::text <> 'organization'
       AND c.relname::text <> ALL (v_tables)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_t)
      INTO v_n USING v_org.organization_id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'tenant_wipe_unmapped_table: public.% holds % row(s) for % but is not in platform_tenant_wipe_tables()',
        v_t, v_n, v_org.slug
        USING ERRCODE = 'feature_not_supported';
    END IF;
  END LOOP;

  -- Row counts (dry run and the audit record).
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_t)
      INTO v_n USING v_org.organization_id;
    v_counts := v_counts || jsonb_build_object(v_t, v_n);
  END LOOP;

  SELECT count(*) INTO v_n
    FROM public.policy_rule pr
    JOIN public.policy p ON p.policy_id = pr.policy_id
   WHERE p.organization_id = v_org.organization_id;
  v_counts := v_counts || jsonb_build_object('policy_rule', v_n);

  -- Accounts that exist only for this tenant: member here, no other membership anywhere,
  -- and never a Salanor platform (staff) account.
  SELECT COALESCE(array_agg(a.account_id), ARRAY[]::uuid[]) INTO v_accounts
    FROM public.account a
   WHERE a.platform_role IS NULL
     AND EXISTS (SELECT 1 FROM public.membership m
                  WHERE m.account_id = a.account_id
                    AND m.organization_id = v_org.organization_id)
     AND NOT EXISTS (SELECT 1 FROM public.membership m2
                      WHERE m2.account_id = a.account_id
                        AND m2.organization_id <> v_org.organization_id);

  SELECT count(*) INTO v_kept
    FROM public.account a
   WHERE EXISTS (SELECT 1 FROM public.membership m
                  WHERE m.account_id = a.account_id
                    AND m.organization_id = v_org.organization_id)
     AND NOT (a.account_id = ANY (v_accounts));

  v_counts := v_counts || jsonb_build_object('account', COALESCE(cardinality(v_accounts), 0));
  v_counts := v_counts || jsonb_build_object('organization', 1);

  IF NOT p_execute THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'organization_id', v_org.organization_id,
      'slug', v_org.slug,
      'is_demo', v_org.is_demo,
      'is_test', v_org.is_test,
      'row_counts', v_counts,
      'accounts_kept_other_tenants', v_kept
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- EXECUTE. Everything below is one transaction (the caller's); any error rolls
  -- back every delete AND the trigger DDL.
  -- -------------------------------------------------------------------------

  -- Append-only triggers on tenant tables: switch off (transactionally) for this wipe only.
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
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_rec.rel, v_rec.trg);
    v_trg_tables := v_trg_tables || v_rec.rel;
    v_trg_names  := v_trg_names  || v_rec.trg;
  END LOOP;

  FOREACH v_t IN ARRAY v_tables LOOP
    IF v_t = 'policy' THEN
      DELETE FROM public.policy_rule
       WHERE policy_id IN (SELECT policy_id FROM public.policy
                            WHERE organization_id = v_org.organization_id);
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_t)
      USING v_org.organization_id;
  END LOOP;

  -- Accounts that belonged only to this tenant (memberships are already gone).
  DELETE FROM public.account a
   WHERE a.account_id = ANY (v_accounts)
     AND a.platform_role IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.membership m WHERE m.account_id = a.account_id);
  GET DIAGNOSTICS v_accounts_del = ROW_COUNT;

  DELETE FROM public.organization WHERE organization_id = v_org.organization_id;

  -- Put the append-only triggers back (still inside this transaction).
  FOR v_i IN 1 .. COALESCE(cardinality(v_trg_tables), 0) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', v_trg_tables[v_i], v_trg_names[v_i]);
  END LOOP;

  -- Post-condition: zero rows left for this tenant, everywhere.
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_t)
      INTO v_n USING v_org.organization_id;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'tenant_wipe_incomplete: public.% still has % row(s)', v_t, v_n;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.organization WHERE organization_id = v_org.organization_id) THEN
    RAISE EXCEPTION 'tenant_wipe_incomplete: organization row still present';
  END IF;

  v_counts := v_counts || jsonb_build_object('account', v_accounts_del);

  INSERT INTO public.platform_tenant_wipe_audit (
    tenant_slug, tenant_name, tenant_organization_id, tenant_flags,
    actor, row_counts, accounts_deleted
  ) VALUES (
    v_org.slug, v_org.name, v_org.organization_id,
    jsonb_build_object('is_demo', v_org.is_demo, 'is_test', v_org.is_test),
    p_actor, v_counts, v_accounts_del::int
  ) RETURNING wipe_id INTO v_audit_id;

  RETURN jsonb_build_object(
    'dry_run', false,
    'organization_id', v_org.organization_id,
    'slug', v_org.slug,
    'is_demo', v_org.is_demo,
    'is_test', v_org.is_test,
    'row_counts', v_counts,
    'accounts_kept_other_tenants', v_kept,
    'audit_id', v_audit_id
  );
END;
$_$;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    account_id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text,
    password_hash text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    platform_role text,
    email_verified_at timestamp with time zone,
    byline_name text,
    byline_title text,
    byline_bio text,
    byline_photo_url text,
    byline_linkedin_url text,
    byline_x_url text,
    byline_instagram_url text,
    CONSTRAINT account_platform_role_check CHECK (((platform_role IS NULL) OR (platform_role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'staff'::text]))))
);

--
-- Name: account_login_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_login_event (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    organization_id uuid,
    method text NOT NULL,
    success boolean DEFAULT true NOT NULL,
    failure_reason text,
    ip_address text,
    user_agent text,
    geo_location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_login_event_method_check CHECK ((method = ANY (ARRAY['password'::text, 'google'::text, 'github'::text, 'sso'::text])))
);

--
-- Name: account_oauth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_oauth (
    provider text NOT NULL,
    provider_subject text NOT NULL,
    account_id uuid NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_oauth_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'github'::text])))
);

--
-- Name: agent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent (
    agent_id text NOT NULL,
    organization_id uuid NOT NULL,
    did text NOT NULL,
    slug text NOT NULL,
    display_name text,
    current_version text,
    default_policy_id text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    declared_tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT agent_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text])))
);

--
-- Name: anomaly_score; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anomaly_score (
    score_id text NOT NULL,
    organization_id uuid NOT NULL,
    agent_id text NOT NULL,
    action_volume_score real,
    deny_rate_score real,
    bypass_attempt_score real,
    composite_score real,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval (
    approval_id text NOT NULL,
    event_id text NOT NULL,
    organization_id uuid NOT NULL,
    approver_user_id uuid,
    channel_type text NOT NULL,
    token_hash text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT approval_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'needs_info'::text])))
);

--
-- Name: approval_channel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_channel (
    channel_id text NOT NULL,
    organization_id uuid NOT NULL,
    channel_type text NOT NULL,
    config jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_channel_channel_type_check CHECK ((channel_type = ANY (ARRAY['slack_oauth'::text, 'web_ui'::text, 'email'::text])))
);

--
-- Name: approval_delegate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_delegate (
    delegate_id text NOT NULL,
    organization_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    role_key text NOT NULL,
    granted_by_membership_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: approval_vote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_vote (
    vote_id text NOT NULL,
    approval_id text NOT NULL,
    organization_id uuid NOT NULL,
    voter_user_id uuid NOT NULL,
    voter_email text,
    decision text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_vote_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text])))
);

--
-- Name: artifact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artifact (
    artifact_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_id text,
    storage_uri text NOT NULL,
    content_hash text NOT NULL,
    worm_locked boolean DEFAULT false NOT NULL,
    retention_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    audit_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auditor_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditor_access_log (
    log_id text NOT NULL,
    invite_id text NOT NULL,
    organization_id uuid NOT NULL,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auditor_invite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditor_invite (
    invite_id text NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    workflow_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: authority_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authority_matrix (
    matrix_id text NOT NULL,
    organization_id uuid NOT NULL,
    product text NOT NULL,
    amount_min numeric DEFAULT 0 NOT NULL,
    amount_max numeric,
    currency text DEFAULT 'RWF'::text NOT NULL,
    risk_tier text,
    required_role text,
    outcome text DEFAULT 'hold'::text NOT NULL,
    rule_code text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authority_matrix_outcome_check CHECK ((outcome = ANY (ARRAY['allow'::text, 'hold'::text, 'stop'::text])))
);

--
-- Name: bank_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_case (
    case_id text NOT NULL,
    organization_id uuid NOT NULL,
    idempotency_key text,
    workflow_id text,
    trace_id text,
    event_id text,
    decision_id text,
    receipt_id text,
    outcome text,
    mode text DEFAULT 'enforce'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    matched_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    policy_id text,
    policy_version integer,
    policy_content_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_case_mode_check CHECK ((mode = ANY (ARRAY['enforce'::text, 'record_only'::text]))),
    CONSTRAINT bank_case_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['allow'::text, 'hold'::text, 'stop'::text, 'expired'::text])))),
    CONSTRAINT bank_case_status_check CHECK ((status = ANY (ARRAY['open'::text, 'held'::text, 'approved'::text, 'stopped'::text, 'expired'::text])))
);

--
-- Name: bank_role_ladder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_role_ladder (
    organization_id uuid NOT NULL,
    role_key text NOT NULL,
    display_name text NOT NULL,
    level integer NOT NULL,
    CONSTRAINT bank_role_ladder_level_check CHECK ((level >= 0))
);

--
-- Name: blog_engagement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_engagement_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    event_name text NOT NULL,
    session_key text NOT NULL,
    value_num double precision,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: compliance_export; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_export (
    export_id text NOT NULL,
    organization_id uuid NOT NULL,
    requested_by uuid,
    bundle_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    storage_uri text,
    integrity_hash text,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    generated_at timestamp with time zone,
    expires_at timestamp with time zone,
    event_count integer,
    byte_size bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compliance_export_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'expired'::text])))
);

--
-- Name: compliance_export_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_export_schedule (
    schedule_id text NOT NULL,
    organization_id uuid NOT NULL,
    bundle_type text DEFAULT 'combined'::text NOT NULL,
    cadence text DEFAULT 'monthly'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    day_of_month integer DEFAULT 1 NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compliance_export_schedule_bundle_type_check CHECK ((bundle_type = ANY (ARRAY['soc2'::text, 'eu_ai_act'::text, 'combined'::text]))),
    CONSTRAINT compliance_export_schedule_cadence_check CHECK ((cadence = 'monthly'::text)),
    CONSTRAINT compliance_export_schedule_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 28)))
);

--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    organization text,
    role text,
    reason text NOT NULL,
    message text NOT NULL,
    source_path text DEFAULT '/contact'::text NOT NULL,
    ip_hash text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    updated_by text,
    CONSTRAINT contact_messages_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text, 'spam'::text])))
);

--
-- Name: did_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.did_document (
    did_document_id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id text NOT NULL,
    organization_id uuid NOT NULL,
    document_json jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: email_verification_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_token (
    token_hash text NOT NULL,
    account_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event (
    event_id text NOT NULL,
    organization_id uuid NOT NULL,
    trace_id text NOT NULL,
    parent_event_id text,
    agent_id text NOT NULL,
    key_id text NOT NULL,
    policy_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    sequence_num bigint NOT NULL,
    prev_event_hash text,
    event_hash text NOT NULL,
    actor_type text NOT NULL,
    actor_principal text NOT NULL,
    action_kind text NOT NULL,
    tool_name text,
    args_hash text,
    args_redacted jsonb,
    policy_decision text NOT NULL,
    policy_obligations jsonb,
    result_status text,
    output_hash text,
    sig_alg text DEFAULT 'ed25519'::text NOT NULL,
    sig_value_b64 text NOT NULL,
    chain_valid boolean DEFAULT true NOT NULL,
    payload jsonb,
    emitted_at timestamp with time zone NOT NULL,
    ingested_at timestamp with time zone DEFAULT now() NOT NULL,
    span_id text,
    search_vector tsvector GENERATED ALWAYS AS (((((setweight(to_tsvector('simple'::regconfig, COALESCE(event_id, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(trace_id, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(agent_id, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(tool_name, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((payload)::text, ''::text)), 'C'::"char"))) STORED,
    legal_hold boolean DEFAULT false NOT NULL,
    purged_at timestamp with time zone,
    CONSTRAINT event_action_kind_check CHECK ((action_kind = ANY (ARRAY['tool_call'::text, 'llm_invocation'::text, 'policy_decision'::text, 'human_approval'::text, 'result'::text, 'provenance_claim'::text, 'decision'::text, 'data_access'::text, 'anomaly_signal'::text]))),
    CONSTRAINT event_actor_type_check CHECK ((actor_type = ANY (ARRAY['agent'::text, 'human'::text, 'system'::text]))),
    CONSTRAINT event_policy_decision_check CHECK ((policy_decision = ANY (ARRAY['allow'::text, 'deny'::text, 'allow_with_obligation'::text, 'allow_retro_audit'::text]))),
    CONSTRAINT event_result_status_check CHECK ((result_status = ANY (ARRAY['ok'::text, 'error'::text, 'timeout'::text, 'blocked'::text])))
);

--
-- Name: field_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_policy (
    organization_id uuid NOT NULL,
    field_path text NOT NULL,
    mode text NOT NULL,
    mask_keep_last integer DEFAULT 4 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT field_policy_mode_check CHECK ((mode = ANY (ARRAY['store'::text, 'mask'::text, 'hash'::text, 'evaluate_only'::text, 'omit'::text])))
);

--
-- Name: forensic_checkpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_checkpoint (
    checkpoint_id text NOT NULL,
    organization_id uuid NOT NULL,
    seq bigint NOT NULL,
    head_hash text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    key_id text NOT NULL,
    sig_alg text DEFAULT 'ed25519'::text NOT NULL,
    sig_value_b64 text NOT NULL,
    tsa_token_b64 text,
    body jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: forensic_receipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_receipt (
    receipt_id text NOT NULL,
    organization_id uuid NOT NULL,
    seq bigint NOT NULL,
    prev_hash text,
    receipt_hash text NOT NULL,
    case_id text,
    decision_id text NOT NULL,
    outcome text NOT NULL,
    mode text DEFAULT 'enforce'::text NOT NULL,
    body jsonb NOT NULL,
    key_id text NOT NULL,
    sig_alg text DEFAULT 'ed25519'::text NOT NULL,
    sig_value_b64 text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT forensic_receipt_mode_check CHECK ((mode = ANY (ARRAY['enforce'::text, 'record_only'::text]))),
    CONSTRAINT forensic_receipt_outcome_check CHECK ((outcome = ANY (ARRAY['allow'::text, 'hold'::text, 'stop'::text, 'expired'::text, 'approved'::text])))
);

--
-- Name: forensic_receipt_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_receipt_seq (
    organization_id uuid NOT NULL,
    next_seq bigint DEFAULT 1 NOT NULL,
    head_hash text
);

--
-- Name: forensic_receipt_timestamp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_receipt_timestamp (
    receipt_id text NOT NULL,
    organization_id uuid NOT NULL,
    message_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    authority text,
    tsa_url text,
    gen_time timestamp with time zone,
    token_b64 text,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT forensic_receipt_timestamp_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'stamped'::text])))
);

--
-- Name: governed_workflow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governed_workflow (
    workflow_id text NOT NULL,
    organization_id uuid NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    name text NOT NULL,
    description text,
    agent_id text,
    policy_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fail_mode text DEFAULT 'fail_closed'::text NOT NULL,
    record_only boolean DEFAULT false NOT NULL,
    CONSTRAINT governed_workflow_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))),
    CONSTRAINT governed_workflow_fail_mode_check CHECK ((fail_mode = ANY (ARRAY['fail_closed'::text, 'fail_open_buffer'::text])))
);

--
-- Name: idempotency_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_record (
    organization_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: incident; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident (
    incident_id text NOT NULL,
    organization_id uuid NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    title text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    summary text,
    trace_id text,
    event_id text,
    workflow_id text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT incident_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))),
    CONSTRAINT incident_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT incident_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'closed'::text])))
);

--
-- Name: incident_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_note (
    note_id text NOT NULL,
    incident_id text NOT NULL,
    organization_id uuid NOT NULL,
    author_user_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: inclusion_proof; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inclusion_proof (
    proof_id text NOT NULL,
    event_id text NOT NULL,
    root_id text NOT NULL,
    organization_id uuid NOT NULL,
    merkle_path jsonb NOT NULL,
    leaf_index integer NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: ingest_api_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_api_key (
    key_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: insurance_metric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_metric (
    metric_id text NOT NULL,
    organization_id uuid NOT NULL,
    tool_risk_class text,
    action_volume bigint,
    policy_deny_rate real,
    approval_bypass_attempts integer,
    anomaly_score_avg real,
    epsilon real,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT insurance_metric_tool_risk_class_check CHECK ((tool_risk_class = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);

--
-- Name: marketing_blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_blog_posts (
    id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text DEFAULT ''::text NOT NULL,
    content_html text DEFAULT ''::text NOT NULL,
    cover_image_url text,
    author_name text DEFAULT 'Landry Bougang'::text NOT NULL,
    author_role text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seo_title text,
    seo_description text,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    published_by_user_id uuid,
    last_published_by_email text,
    body_markdown text DEFAULT ''::text NOT NULL,
    author_account_id uuid,
    author_email text,
    created_by_email text,
    last_edited_by_email text,
    CONSTRAINT marketing_blog_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);

--
-- Name: membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership (
    membership_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text DEFAULT 'engineer'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    CONSTRAINT membership_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'approver'::text, 'engineer'::text, 'developer'::text, 'auditor'::text, 'viewer'::text]))),
    CONSTRAINT membership_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);

--
-- Name: membership_bank_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_bank_role (
    membership_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role_key text NOT NULL
);

--
-- Name: merkle_root; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merkle_root (
    root_id text NOT NULL,
    organization_id uuid NOT NULL,
    root_hash text NOT NULL,
    tree_size integer NOT NULL,
    interval_start timestamp with time zone NOT NULL,
    interval_end timestamp with time zone NOT NULL,
    sig_value_b64 text,
    sig_key_id text,
    anchoring_type text,
    external_tx_id text,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    tsa_status text,
    tsa_authority text,
    tsa_url text,
    tsa_gen_time timestamp with time zone,
    tsa_token_b64 text,
    tsa_message_hash text,
    tsa_last_error text,
    tsa_next_attempt_at timestamp with time zone,
    CONSTRAINT merkle_root_anchoring_type_check CHECK ((anchoring_type = ANY (ARRAY['internal'::text, 'bitcoin'::text, 'ethereum'::text]))),
    CONSTRAINT merkle_root_tsa_status_check CHECK ((tsa_status IS NULL OR (tsa_status = ANY (ARRAY['pending'::text, 'stamped'::text]))))
);

--
-- Name: newsletter_campaign_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_campaign_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    subscriber_id uuid NOT NULL,
    status text NOT NULL,
    error_message text,
    provider_id text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT newsletter_campaign_deliveries_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text])))
);

--
-- Name: newsletter_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    preview_text text,
    body_html text NOT NULL,
    body_text text NOT NULL,
    body_markdown text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by_email text,
    sent_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT newsletter_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT newsletter_campaigns_subject_nonempty CHECK ((char_length(TRIM(BOTH FROM subject)) > 0))
);

--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    confirm_token text,
    confirm_token_expires_at timestamp with time zone,
    unsubscribe_token text NOT NULL,
    unsubscribed_at timestamp with time zone,
    source text DEFAULT 'website'::text NOT NULL,
    signup_ip_hash text,
    CONSTRAINT newsletter_subscribers_email_nonempty CHECK ((char_length(TRIM(BOTH FROM email)) > 0))
);

--
-- Name: open_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    team text NOT NULL,
    location text NOT NULL,
    seniority text NOT NULL,
    employment_type text NOT NULL,
    summary text NOT NULL,
    requirements text NOT NULL,
    compensation_range text,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    closes_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT open_roles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text])))
);

--
-- Name: organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization (
    organization_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    region text DEFAULT 'us-east'::text NOT NULL,
    topology text DEFAULT 'cloud'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_overrides jsonb,
    stripe_customer_id text,
    onboarding_completed_at timestamp with time zone,
    billing_source text DEFAULT 'none'::text NOT NULL,
    billing_status text DEFAULT 'none'::text NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    governance_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    signal_fallback text DEFAULT 'allow_with_obligation'::text NOT NULL,
    signal_stale_hours integer DEFAULT 24 NOT NULL,
    legal_hold boolean DEFAULT false NOT NULL,
    is_demo boolean DEFAULT false NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT organization_billing_source_check CHECK ((billing_source = ANY (ARRAY['none'::text, 'manual'::text, 'stripe'::text]))),
    CONSTRAINT organization_billing_status_check CHECK ((billing_status = ANY (ARRAY['none'::text, 'pending'::text, 'active'::text, 'past_due'::text, 'canceled'::text]))),
    CONSTRAINT organization_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'team'::text, 'enterprise'::text]))),
    CONSTRAINT organization_region_check CHECK ((region = ANY (ARRAY['us-east'::text, 'eu-west'::text, 'ap-southeast'::text]))),
    CONSTRAINT organization_signal_fallback_check CHECK ((signal_fallback = ANY (ARRAY['allow'::text, 'allow_with_obligation'::text, 'deny'::text]))),
    CONSTRAINT organization_topology_check CHECK ((topology = ANY (ARRAY['cloud'::text, 'byoc'::text, 'onprem'::text])))
);

--
-- Name: organization_billing_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_billing_event (
    billing_event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_type text NOT NULL,
    plan_slug text,
    external_invoice_ref text,
    amount_cents integer,
    currency text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    note text,
    actor_account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_billing_event_event_type_check CHECK ((event_type = ANY (ARRAY['quote_recorded'::text, 'invoice_noted'::text, 'payment_recorded'::text, 'plan_activated'::text, 'plan_downgraded'::text, 'period_extended'::text])))
);

--
-- Name: organization_invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invitation (
    invitation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'engineer'::text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_invitation_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'approver'::text, 'engineer'::text, 'developer'::text, 'auditor'::text, 'viewer'::text]))),
    CONSTRAINT organization_invitation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);

--
-- Name: organization_scim; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_scim (
    organization_id uuid NOT NULL,
    bearer_token_hash text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    default_role text DEFAULT 'engineer'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_scim_default_role_check CHECK ((default_role = ANY (ARRAY['admin'::text, 'engineer'::text, 'auditor'::text, 'viewer'::text])))
);

--
-- Name: organization_scim_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_scim_group (
    scim_group_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    external_id text,
    display_name text NOT NULL,
    role text DEFAULT 'engineer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_scim_group_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'engineer'::text, 'auditor'::text, 'viewer'::text])))
);

--
-- Name: organization_scim_group_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_scim_group_member (
    scim_group_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    organization_id uuid NOT NULL
);

--
-- Name: organization_sso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_sso (
    organization_id uuid NOT NULL,
    provider text DEFAULT 'workos'::text NOT NULL,
    workos_organization_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    jit_provision boolean DEFAULT false NOT NULL,
    CONSTRAINT organization_sso_provider_check CHECK ((provider = 'workos'::text))
);

--
-- Name: organization_usage_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_usage_monthly (
    organization_id uuid NOT NULL,
    period_month date NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: password_reset_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_token (
    token_hash text NOT NULL,
    account_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: plan_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_catalog (
    plan_slug text NOT NULL,
    display_name text NOT NULL,
    events_per_month integer,
    max_ingest_keys integer NOT NULL,
    max_members integer NOT NULL,
    retention_days integer DEFAULT 90 NOT NULL,
    self_serve boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    stripe_price_id text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    list_price text DEFAULT ''::text NOT NULL,
    list_price_detail text DEFAULT ''::text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    billing_note text DEFAULT ''::text NOT NULL,
    marketing_highlighted boolean DEFAULT false NOT NULL
);

--
-- Name: platform_email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_email_settings (
    id smallint DEFAULT 1 NOT NULL,
    delivery text DEFAULT 'platform'::text NOT NULL,
    from_name text,
    from_address text,
    reply_to text,
    resend_api_key_ciphertext text,
    key_prefix text,
    key_last4 text,
    smtp_host text,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_secure boolean DEFAULT false NOT NULL,
    smtp_user text,
    smtp_password_ciphertext text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    CONSTRAINT platform_email_settings_id_check CHECK ((id = 1)),
    CONSTRAINT platform_email_settings_delivery_check CHECK ((delivery = ANY (ARRAY['platform'::text, 'smtp'::text])))
);

--
-- Name: platform_tenant_wipe_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_tenant_wipe_audit (
    wipe_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wiped_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_slug text NOT NULL,
    tenant_name text,
    tenant_organization_id uuid NOT NULL,
    tenant_flags jsonb NOT NULL,
    actor text NOT NULL,
    db_session_user text DEFAULT SESSION_USER NOT NULL,
    db_current_user text DEFAULT CURRENT_USER NOT NULL,
    client_addr inet DEFAULT inet_client_addr(),
    row_counts jsonb NOT NULL,
    accounts_deleted integer DEFAULT 0 NOT NULL
);

--
-- Name: policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy (
    policy_id text NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    version integer NOT NULL,
    rego_source text,
    wasm_artifact_uri text,
    wasm_artifact bytea,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    combine text DEFAULT 'top_priority'::text NOT NULL,
    content_hash text,
    dual_publish_required boolean DEFAULT false NOT NULL,
    CONSTRAINT policy_combine_check CHECK ((combine = ANY (ARRAY['top_priority'::text, 'all_matching'::text]))),
    CONSTRAINT policy_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))),
    CONSTRAINT policy_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))
);

--
-- Name: policy_activation_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_activation_request (
    request_id text NOT NULL,
    organization_id uuid NOT NULL,
    policy_id text NOT NULL,
    requested_by uuid NOT NULL,
    confirmed_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    CONSTRAINT policy_activation_request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'activated'::text, 'cancelled'::text])))
);

--
-- Name: policy_publish_approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_publish_approval (
    approval_id text NOT NULL,
    policy_id text NOT NULL,
    organization_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: policy_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_rule (
    rule_id text NOT NULL,
    policy_id text NOT NULL,
    tool_pattern text NOT NULL,
    decision text NOT NULL,
    conditions jsonb,
    obligations jsonb,
    priority integer DEFAULT 0 NOT NULL,
    CONSTRAINT policy_rule_decision_check CHECK ((decision = ANY (ARRAY['allow'::text, 'deny'::text, 'allow_with_obligation'::text, 'allow_retro_audit'::text])))
);

--
-- Name: receipt_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_access_log (
    access_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    receipt_id text NOT NULL,
    actor_membership_id uuid,
    actor_email text,
    action text DEFAULT 'view'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: receipt_share_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_share_token (
    share_id text NOT NULL,
    organization_id uuid NOT NULL,
    event_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    last_accessed_at timestamp with time zone,
    access_count integer DEFAULT 0 NOT NULL
);

--
-- Name: receipt_signing_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_signing_key (
    key_id text NOT NULL,
    custody text NOT NULL,
    alg text DEFAULT 'ed25519'::text NOT NULL,
    public_key_b64 text NOT NULL,
    fingerprint text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    CONSTRAINT receipt_signing_key_alg_check CHECK ((alg = 'ed25519'::text)),
    CONSTRAINT receipt_signing_key_custody_check CHECK ((custody = ANY (ARRAY['kms'::text, 'software_interim'::text, 'software'::text]))),
    CONSTRAINT receipt_signing_key_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

--
-- Name: research_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.research_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    dek text NOT NULL,
    body text NOT NULL,
    author_account_id uuid,
    published_by_account_id uuid,
    last_edited_by_account_id uuid,
    track text NOT NULL,
    published_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reading_minutes integer DEFAULT 5 NOT NULL,
    hero_image_url text,
    og_image_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT research_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text])))
);

--

--
-- Name: score_band; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.score_band (
    band_id text NOT NULL,
    organization_id uuid NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    name text NOT NULL,
    min_score numeric NOT NULL,
    max_score numeric NOT NULL,
    decision text NOT NULL,
    require_four_eyes boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT score_band_check CHECK ((min_score <= max_score)),
    CONSTRAINT score_band_decision_check CHECK ((decision = ANY (ARRAY['allow'::text, 'allow_with_obligation'::text, 'deny'::text]))),
    CONSTRAINT score_band_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text])))
);

--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    account_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    impersonator_account_id uuid,
    parent_session_id uuid,
    impersonation_started_at timestamp with time zone
);

--
-- Name: siem_destination; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siem_destination (
    dest_id text NOT NULL,
    organization_id uuid NOT NULL,
    provider text NOT NULL,
    otel_endpoint text,
    auth_config jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    last_flushed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siem_destination_provider_check CHECK ((provider = ANY (ARRAY['splunk'::text, 'datadog'::text, 'sentinel'::text]))),
    CONSTRAINT siem_destination_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'error'::text])))
);

--
-- Name: signed_event_buffer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signed_event_buffer (
    buffer_id text NOT NULL,
    organization_id uuid NOT NULL,
    agent_id text NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    event_json jsonb NOT NULL,
    signature_b64 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    drained_at timestamp with time zone,
    drain_error text,
    CONSTRAINT signed_event_buffer_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text])))
);

--
-- Name: signing_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_key (
    key_id text NOT NULL,
    agent_id text NOT NULL,
    organization_id uuid NOT NULL,
    kms_provider text,
    kms_key_arn text,
    public_key_b64 text NOT NULL,
    algorithm text DEFAULT 'ed25519'::text NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    private_key_ciphertext text,
    bridge_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT signing_key_algorithm_check CHECK ((algorithm = 'ed25519'::text)),
    CONSTRAINT signing_key_kms_provider_check CHECK ((kms_provider = ANY (ARRAY['aws'::text, 'gcp'::text, 'azure'::text, 'vault'::text, 'dev'::text])))
);

--
-- Name: signing_key_rotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_key_rotation (
    rotation_id text NOT NULL,
    organization_id uuid NOT NULL,
    agent_id text NOT NULL,
    previous_key_id text,
    new_key_id text NOT NULL,
    reason text,
    actor_membership_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: span; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.span (
    span_id text NOT NULL,
    organization_id uuid NOT NULL,
    trace_id text NOT NULL,
    parent_span_id text,
    label text,
    status text DEFAULT 'open'::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT span_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

--
-- Name: trace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trace (
    trace_id text NOT NULL,
    organization_id uuid NOT NULL,
    agent_id text NOT NULL,
    root_event_id text,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    total_events integer DEFAULT 0 NOT NULL,
    denied_events integer DEFAULT 0 NOT NULL,
    approved_events integer DEFAULT 0 NOT NULL,
    CONSTRAINT trace_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'blocked'::text, 'executing'::text])))
);

--
-- Name: transparency_log_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transparency_log_entry (
    entry_id text NOT NULL,
    organization_id uuid NOT NULL,
    event_id text NOT NULL,
    root_id text,
    log_index bigint NOT NULL,
    leaf_hash text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: webhook_endpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoint (
    endpoint_id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    url text NOT NULL,
    secret_hash text NOT NULL,
    events_filter jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: worker_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_run (
    run_id text NOT NULL,
    worker_name text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    CONSTRAINT worker_run_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text, 'skipped'::text]))),
    CONSTRAINT worker_run_worker_name_check CHECK ((worker_name = ANY (ARRAY['witness'::text, 'compliance'::text, 'housekeeping'::text])))
);

--
-- Name: workflow_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_run (
    trace_id text NOT NULL,
    organization_id uuid NOT NULL,
    agent_id text NOT NULL,
    key_id text NOT NULL,
    external_system text DEFAULT 'n8n'::text NOT NULL,
    external_workflow_id text,
    external_execution_id text,
    status text DEFAULT 'running'::text NOT NULL,
    root_event_id text,
    business_context text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT workflow_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);

--
-- Name: account_login_event account_login_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_login_event
    ADD CONSTRAINT account_login_event_pkey PRIMARY KEY (event_id);

--
-- Name: account_oauth account_oauth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_oauth
    ADD CONSTRAINT account_oauth_pkey PRIMARY KEY (provider, provider_subject);

--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (account_id);

--
-- Name: agent agent_organization_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT agent_organization_id_slug_key UNIQUE (organization_id, slug);

--
-- Name: agent agent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT agent_pkey PRIMARY KEY (agent_id);

--
-- Name: anomaly_score anomaly_score_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomaly_score
    ADD CONSTRAINT anomaly_score_pkey PRIMARY KEY (score_id);

--
-- Name: approval_channel approval_channel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_channel
    ADD CONSTRAINT approval_channel_pkey PRIMARY KEY (channel_id);

--
-- Name: approval_delegate approval_delegate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegate
    ADD CONSTRAINT approval_delegate_pkey PRIMARY KEY (delegate_id);

--
-- Name: approval approval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_pkey PRIMARY KEY (approval_id);

--
-- Name: approval_vote approval_vote_approval_id_voter_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_vote
    ADD CONSTRAINT approval_vote_approval_id_voter_user_id_key UNIQUE (approval_id, voter_user_id);

--
-- Name: approval_vote approval_vote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_vote
    ADD CONSTRAINT approval_vote_pkey PRIMARY KEY (vote_id);

--
-- Name: artifact artifact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_pkey PRIMARY KEY (artifact_id);

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);

--
-- Name: auditor_access_log auditor_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditor_access_log
    ADD CONSTRAINT auditor_access_log_pkey PRIMARY KEY (log_id);

--
-- Name: auditor_invite auditor_invite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditor_invite
    ADD CONSTRAINT auditor_invite_pkey PRIMARY KEY (invite_id);

--
-- Name: authority_matrix authority_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authority_matrix
    ADD CONSTRAINT authority_matrix_pkey PRIMARY KEY (matrix_id);

--
-- Name: bank_case bank_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_case
    ADD CONSTRAINT bank_case_pkey PRIMARY KEY (organization_id, case_id);

--
-- Name: bank_role_ladder bank_role_ladder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_role_ladder
    ADD CONSTRAINT bank_role_ladder_pkey PRIMARY KEY (organization_id, role_key);

--
-- Name: blog_engagement_events blog_engagement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_engagement_events
    ADD CONSTRAINT blog_engagement_events_pkey PRIMARY KEY (id);

--
-- Name: compliance_export compliance_export_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export
    ADD CONSTRAINT compliance_export_pkey PRIMARY KEY (export_id);

--
-- Name: compliance_export_schedule compliance_export_schedule_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export_schedule
    ADD CONSTRAINT compliance_export_schedule_organization_id_key UNIQUE (organization_id);

--
-- Name: compliance_export_schedule compliance_export_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export_schedule
    ADD CONSTRAINT compliance_export_schedule_pkey PRIMARY KEY (schedule_id);

--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);

--
-- Name: did_document did_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_document
    ADD CONSTRAINT did_document_pkey PRIMARY KEY (did_document_id);

--
-- Name: email_verification_token email_verification_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_token
    ADD CONSTRAINT email_verification_token_pkey PRIMARY KEY (token_hash);

--
-- Name: event event_organization_id_agent_id_sequence_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_organization_id_agent_id_sequence_num_key UNIQUE (organization_id, agent_id, sequence_num);

--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (event_id);

--
-- Name: field_policy field_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_policy
    ADD CONSTRAINT field_policy_pkey PRIMARY KEY (organization_id, field_path);

--
-- Name: forensic_checkpoint forensic_checkpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_checkpoint
    ADD CONSTRAINT forensic_checkpoint_pkey PRIMARY KEY (checkpoint_id);

--
-- Name: forensic_receipt forensic_receipt_organization_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt
    ADD CONSTRAINT forensic_receipt_organization_id_seq_key UNIQUE (organization_id, seq);

--
-- Name: forensic_receipt forensic_receipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt
    ADD CONSTRAINT forensic_receipt_pkey PRIMARY KEY (receipt_id);

--
-- Name: forensic_receipt_seq forensic_receipt_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt_seq
    ADD CONSTRAINT forensic_receipt_seq_pkey PRIMARY KEY (organization_id);

--
-- Name: forensic_receipt_timestamp forensic_receipt_timestamp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt_timestamp
    ADD CONSTRAINT forensic_receipt_timestamp_pkey PRIMARY KEY (receipt_id);

--
-- Name: governed_workflow governed_workflow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governed_workflow
    ADD CONSTRAINT governed_workflow_pkey PRIMARY KEY (workflow_id);

--
-- Name: idempotency_record idempotency_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_record
    ADD CONSTRAINT idempotency_record_pkey PRIMARY KEY (organization_id, idempotency_key);

--
-- Name: incident_note incident_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_note
    ADD CONSTRAINT incident_note_pkey PRIMARY KEY (note_id);

--
-- Name: incident incident_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident
    ADD CONSTRAINT incident_pkey PRIMARY KEY (incident_id);

--
-- Name: inclusion_proof inclusion_proof_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inclusion_proof
    ADD CONSTRAINT inclusion_proof_pkey PRIMARY KEY (proof_id);

--
-- Name: ingest_api_key ingest_api_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_api_key
    ADD CONSTRAINT ingest_api_key_pkey PRIMARY KEY (key_id);

--
-- Name: insurance_metric insurance_metric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_metric
    ADD CONSTRAINT insurance_metric_pkey PRIMARY KEY (metric_id);

--
-- Name: marketing_blog_posts marketing_blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_pkey PRIMARY KEY (id);

--
-- Name: marketing_blog_posts marketing_blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_slug_key UNIQUE (slug);

--
-- Name: membership_bank_role membership_bank_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_bank_role
    ADD CONSTRAINT membership_bank_role_pkey PRIMARY KEY (membership_id, role_key);

--
-- Name: membership membership_organization_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_organization_id_account_id_key UNIQUE (organization_id, account_id);

--
-- Name: membership membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_pkey PRIMARY KEY (membership_id);

--
-- Name: merkle_root merkle_root_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merkle_root
    ADD CONSTRAINT merkle_root_pkey PRIMARY KEY (root_id);

--
-- Name: newsletter_campaign_deliveries newsletter_campaign_deliveries_campaign_id_subscriber_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaign_deliveries
    ADD CONSTRAINT newsletter_campaign_deliveries_campaign_id_subscriber_id_key UNIQUE (campaign_id, subscriber_id);

--
-- Name: newsletter_campaign_deliveries newsletter_campaign_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaign_deliveries
    ADD CONSTRAINT newsletter_campaign_deliveries_pkey PRIMARY KEY (id);

--
-- Name: newsletter_campaigns newsletter_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaigns
    ADD CONSTRAINT newsletter_campaigns_pkey PRIMARY KEY (id);

--
-- Name: newsletter_subscribers newsletter_subscribers_confirm_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_confirm_token_key UNIQUE (confirm_token);

--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);

--
-- Name: newsletter_subscribers newsletter_subscribers_unsubscribe_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_unsubscribe_token_key UNIQUE (unsubscribe_token);

--
-- Name: open_roles open_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_roles
    ADD CONSTRAINT open_roles_pkey PRIMARY KEY (id);

--
-- Name: open_roles open_roles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_roles
    ADD CONSTRAINT open_roles_slug_key UNIQUE (slug);

--
-- Name: organization_billing_event organization_billing_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_billing_event
    ADD CONSTRAINT organization_billing_event_pkey PRIMARY KEY (billing_event_id);

--
-- Name: organization_invitation organization_invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitation
    ADD CONSTRAINT organization_invitation_pkey PRIMARY KEY (invitation_id);

--
-- Name: organization_invitation organization_invitation_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitation
    ADD CONSTRAINT organization_invitation_token_hash_key UNIQUE (token_hash);

--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (organization_id);

--
-- Name: organization_scim_group_member organization_scim_group_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group_member
    ADD CONSTRAINT organization_scim_group_member_pkey PRIMARY KEY (scim_group_id, membership_id);

--
-- Name: organization_scim_group organization_scim_group_organization_id_display_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group
    ADD CONSTRAINT organization_scim_group_organization_id_display_name_key UNIQUE (organization_id, display_name);

--
-- Name: organization_scim_group organization_scim_group_organization_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group
    ADD CONSTRAINT organization_scim_group_organization_id_external_id_key UNIQUE (organization_id, external_id);

--
-- Name: organization_scim_group organization_scim_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group
    ADD CONSTRAINT organization_scim_group_pkey PRIMARY KEY (scim_group_id);

--
-- Name: organization_scim organization_scim_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim
    ADD CONSTRAINT organization_scim_pkey PRIMARY KEY (organization_id);

--
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);

--
-- Name: organization_sso organization_sso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_sso
    ADD CONSTRAINT organization_sso_pkey PRIMARY KEY (organization_id);

--
-- Name: organization_usage_monthly organization_usage_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_monthly
    ADD CONSTRAINT organization_usage_monthly_pkey PRIMARY KEY (organization_id, period_month);

--
-- Name: password_reset_token password_reset_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (token_hash);

--
-- Name: plan_catalog plan_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_catalog
    ADD CONSTRAINT plan_catalog_pkey PRIMARY KEY (plan_slug);

--
-- Name: platform_email_settings platform_email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_settings
    ADD CONSTRAINT platform_email_settings_pkey PRIMARY KEY (id);

--
-- Name: platform_tenant_wipe_audit platform_tenant_wipe_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_tenant_wipe_audit
    ADD CONSTRAINT platform_tenant_wipe_audit_pkey PRIMARY KEY (wipe_id);

--
-- Name: policy_activation_request policy_activation_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_activation_request
    ADD CONSTRAINT policy_activation_request_pkey PRIMARY KEY (request_id);

--
-- Name: policy policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy
    ADD CONSTRAINT policy_pkey PRIMARY KEY (policy_id);

--
-- Name: policy_publish_approval policy_publish_approval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_publish_approval
    ADD CONSTRAINT policy_publish_approval_pkey PRIMARY KEY (approval_id);

--
-- Name: policy_publish_approval policy_publish_approval_policy_id_membership_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_publish_approval
    ADD CONSTRAINT policy_publish_approval_policy_id_membership_id_key UNIQUE (policy_id, membership_id);

--
-- Name: policy_rule policy_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule
    ADD CONSTRAINT policy_rule_pkey PRIMARY KEY (rule_id);

--
-- Name: receipt_access_log receipt_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_access_log
    ADD CONSTRAINT receipt_access_log_pkey PRIMARY KEY (access_id);

--
-- Name: receipt_share_token receipt_share_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_share_token
    ADD CONSTRAINT receipt_share_token_pkey PRIMARY KEY (share_id);

--
-- Name: receipt_signing_key receipt_signing_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_signing_key
    ADD CONSTRAINT receipt_signing_key_pkey PRIMARY KEY (key_id);

--
-- Name: research_posts research_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_posts
    ADD CONSTRAINT research_posts_pkey PRIMARY KEY (id);

--
-- Name: research_posts research_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_posts
    ADD CONSTRAINT research_posts_slug_key UNIQUE (slug);

--

--
-- Name: score_band score_band_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_band
    ADD CONSTRAINT score_band_pkey PRIMARY KEY (band_id);

--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (session_id);

--
-- Name: session session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_hash_key UNIQUE (token_hash);

--
-- Name: siem_destination siem_destination_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siem_destination
    ADD CONSTRAINT siem_destination_pkey PRIMARY KEY (dest_id);

--
-- Name: signed_event_buffer signed_event_buffer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signed_event_buffer
    ADD CONSTRAINT signed_event_buffer_pkey PRIMARY KEY (buffer_id);

--
-- Name: signing_key signing_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key
    ADD CONSTRAINT signing_key_pkey PRIMARY KEY (key_id);

--
-- Name: signing_key_rotation signing_key_rotation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_pkey PRIMARY KEY (rotation_id);

--
-- Name: span span_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.span
    ADD CONSTRAINT span_pkey PRIMARY KEY (span_id);

--
-- Name: trace trace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trace
    ADD CONSTRAINT trace_pkey PRIMARY KEY (trace_id);

--
-- Name: transparency_log_entry transparency_log_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transparency_log_entry
    ADD CONSTRAINT transparency_log_entry_pkey PRIMARY KEY (entry_id);

--
-- Name: webhook_endpoint webhook_endpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint
    ADD CONSTRAINT webhook_endpoint_pkey PRIMARY KEY (endpoint_id);

--
-- Name: worker_run worker_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_run
    ADD CONSTRAINT worker_run_pkey PRIMARY KEY (run_id);

--
-- Name: workflow_run workflow_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT workflow_run_pkey PRIMARY KEY (trace_id);

--
-- Name: agent_org_environment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_org_environment_idx ON public.agent USING btree (organization_id, environment);

--
-- Name: approval_vote_approval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_vote_approval_idx ON public.approval_vote USING btree (organization_id, approval_id);

--
-- Name: blog_engagement_events_event_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_engagement_events_event_created_idx ON public.blog_engagement_events USING btree (event_name, created_at DESC);

--
-- Name: blog_engagement_events_slug_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_engagement_events_slug_created_idx ON public.blog_engagement_events USING btree (slug, created_at DESC);

--
-- Name: contact_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_messages_created_at_idx ON public.contact_messages USING btree (created_at DESC);

--
-- Name: contact_messages_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_messages_status_created_at_idx ON public.contact_messages USING btree (status, created_at DESC);

--
-- Name: governed_workflow_org_env_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX governed_workflow_org_env_idx ON public.governed_workflow USING btree (organization_id, environment);

--
-- Name: idx_account_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_account_email_lower ON public.account USING btree (lower(email));

--
-- Name: idx_account_login_event_account_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_login_event_account_created ON public.account_login_event USING btree (account_id, created_at DESC);

--
-- Name: idx_account_oauth_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_oauth_account ON public.account_oauth USING btree (account_id);

--
-- Name: idx_approval_delegate_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_delegate_active ON public.approval_delegate USING btree (organization_id, membership_id, expires_at) WHERE (revoked_at IS NULL);

--
-- Name: idx_audit_log_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_org ON public.audit_log USING btree (organization_id, created_at DESC);

--
-- Name: idx_authority_matrix_org_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authority_matrix_org_product ON public.authority_matrix USING btree (organization_id, product, active) WHERE (active = true);

--
-- Name: idx_bank_case_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bank_case_idempotency ON public.bank_case USING btree (organization_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

--
-- Name: idx_bank_case_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_case_org_created ON public.bank_case USING btree (organization_id, created_at DESC);

--
-- Name: idx_compliance_schedule_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_schedule_due ON public.compliance_export_schedule USING btree (next_run_at) WHERE (enabled = true);

--
-- Name: idx_email_verification_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_account ON public.email_verification_token USING btree (account_id, expires_at DESC);

--
-- Name: idx_event_org_emitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_org_emitted ON public.event USING btree (organization_id, emitted_at DESC);

--
-- Name: idx_event_org_purge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_org_purge ON public.event USING btree (organization_id, emitted_at) WHERE ((purged_at IS NULL) AND (legal_hold = false));

--
-- Name: idx_event_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_search_vector ON public.event USING gin (search_vector);

--
-- Name: idx_event_span; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_span ON public.event USING btree (span_id);

--
-- Name: idx_event_trace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_trace ON public.event USING btree (trace_id);

--
-- Name: idx_forensic_checkpoint_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_checkpoint_org ON public.forensic_checkpoint USING btree (organization_id, issued_at DESC);

--
-- Name: idx_forensic_receipt_org_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_receipt_org_case ON public.forensic_receipt USING btree (organization_id, case_id);

--
-- Name: idx_forensic_receipt_org_issued; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_receipt_org_issued ON public.forensic_receipt USING btree (organization_id, issued_at DESC);

--
-- Name: idx_ingest_api_key_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_api_key_org ON public.ingest_api_key USING btree (organization_id);

--
-- Name: idx_invitation_org_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invitation_org_email_pending ON public.organization_invitation USING btree (organization_id, lower(email)) WHERE (status = 'pending'::text);

--
-- Name: idx_invitation_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_org_status ON public.organization_invitation USING btree (organization_id, status);

--
-- Name: idx_membership_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_account ON public.membership USING btree (account_id);

--
-- Name: idx_membership_bank_role_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_bank_role_org ON public.membership_bank_role USING btree (organization_id, role_key);

--
-- Name: idx_org_usage_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_usage_month ON public.organization_usage_monthly USING btree (period_month);

--
-- Name: idx_organization_sso_workos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_sso_workos ON public.organization_sso USING btree (workos_organization_id) WHERE (enabled = true);

--
-- Name: idx_organization_stripe_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_stripe_customer ON public.organization USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);

--
-- Name: idx_password_reset_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_account ON public.password_reset_token USING btree (account_id, expires_at DESC);

--
-- Name: idx_platform_tenant_wipe_audit_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_tenant_wipe_audit_at ON public.platform_tenant_wipe_audit USING btree (wiped_at DESC);

--
-- Name: idx_receipt_access_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_access_org ON public.receipt_access_log USING btree (organization_id, created_at DESC);

--
-- Name: idx_receipt_timestamp_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_timestamp_org ON public.forensic_receipt_timestamp USING btree (organization_id);

--
-- Name: idx_receipt_timestamp_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receipt_timestamp_pending ON public.forensic_receipt_timestamp USING btree (next_attempt_at) WHERE (status = 'pending'::text);

--
-- Name: idx_signing_key_rotation_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signing_key_rotation_agent ON public.signing_key_rotation USING btree (agent_id, created_at DESC);

--
-- Name: idx_signing_key_rotation_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signing_key_rotation_org ON public.signing_key_rotation USING btree (organization_id, created_at DESC);

--
-- Name: idx_span_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_span_org ON public.span USING btree (organization_id, started_at DESC);

--
-- Name: idx_span_trace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_span_trace ON public.span USING btree (trace_id);

--
-- Name: idx_trace_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trace_org ON public.trace USING btree (organization_id, started_at DESC);

--
-- Name: idx_transparency_log_org_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transparency_log_org_published ON public.transparency_log_entry USING btree (organization_id, published_at DESC);

--
-- Name: idx_worker_run_name_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_run_name_started ON public.worker_run USING btree (worker_name, started_at DESC);

--
-- Name: incident_note_incident_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incident_note_incident_idx ON public.incident_note USING btree (incident_id, created_at);

--
-- Name: incident_org_env_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incident_org_env_idx ON public.incident USING btree (organization_id, environment, created_at DESC);

--
-- Name: marketing_blog_posts_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_blog_posts_slug_idx ON public.marketing_blog_posts USING btree (slug);

--
-- Name: marketing_blog_posts_status_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_blog_posts_status_published_at_idx ON public.marketing_blog_posts USING btree (status, published_at DESC NULLS LAST);

--
-- Name: newsletter_campaign_deliveries_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_campaign_deliveries_campaign_idx ON public.newsletter_campaign_deliveries USING btree (campaign_id);

--
-- Name: newsletter_campaigns_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_campaigns_created_at_idx ON public.newsletter_campaigns USING btree (created_at DESC);

--
-- Name: newsletter_campaigns_scheduled_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_campaigns_scheduled_due_idx ON public.newsletter_campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text);

--
-- Name: newsletter_subscribers_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_subscribers_active_idx ON public.newsletter_subscribers USING btree (confirmed_at) WHERE ((confirmed_at IS NOT NULL) AND (unsubscribed_at IS NULL));

--
-- Name: newsletter_subscribers_email_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX newsletter_subscribers_email_lower_key ON public.newsletter_subscribers USING btree (lower(TRIM(BOTH FROM email)));

--
-- Name: newsletter_subscribers_unsubscribed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX newsletter_subscribers_unsubscribed_at_idx ON public.newsletter_subscribers USING btree (unsubscribed_at) WHERE (unsubscribed_at IS NOT NULL);

--
-- Name: open_roles_status_posted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_roles_status_posted_at_idx ON public.open_roles USING btree (status, posted_at DESC);

--
-- Name: organization_billing_event_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_billing_event_org_created_idx ON public.organization_billing_event USING btree (organization_id, created_at DESC);

--
-- Name: organization_scim_group_member_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_scim_group_member_membership_idx ON public.organization_scim_group_member USING btree (membership_id);

--
-- Name: organization_scim_group_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_scim_group_org_idx ON public.organization_scim_group USING btree (organization_id);

--
-- Name: policy_activation_request_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_activation_request_org_idx ON public.policy_activation_request USING btree (organization_id, status);

--
-- Name: receipt_share_token_hash_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX receipt_share_token_hash_uidx ON public.receipt_share_token USING btree (token_hash);

--
-- Name: receipt_share_token_org_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipt_share_token_org_event_idx ON public.receipt_share_token USING btree (organization_id, event_id, created_at DESC);

--
-- Name: research_posts_author_account_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX research_posts_author_account_id_idx ON public.research_posts USING btree (author_account_id);

--
-- Name: research_posts_status_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX research_posts_status_published_at_idx ON public.research_posts USING btree (status, published_at DESC NULLS LAST);

--
-- Name: score_band_org_env_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX score_band_org_env_idx ON public.score_band USING btree (organization_id, environment, sort_order);

--
-- Name: signed_event_buffer_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signed_event_buffer_pending_idx ON public.signed_event_buffer USING btree (organization_id, drained_at) WHERE (drained_at IS NULL);

--
-- Name: uq_transparency_log_org_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_transparency_log_org_event ON public.transparency_log_entry USING btree (organization_id, event_id);

--
-- Name: uq_transparency_log_org_log_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_transparency_log_org_log_index ON public.transparency_log_entry USING btree (organization_id, log_index);

--
-- Name: workflow_run_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_run_external_idx ON public.workflow_run USING btree (organization_id, external_system, external_execution_id) WHERE (external_execution_id IS NOT NULL);

--
-- Name: workflow_run_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_run_org_created_idx ON public.workflow_run USING btree (organization_id, created_at DESC);

--
-- Name: event trg_event_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_append_only BEFORE DELETE OR UPDATE ON public.event FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_event_seal_mutation();

--
-- Name: forensic_receipt trg_forensic_receipt_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_forensic_receipt_append_only BEFORE DELETE OR UPDATE ON public.forensic_receipt FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_receipt_mutation();

--
-- Name: platform_tenant_wipe_audit trg_platform_wipe_audit_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_platform_wipe_audit_immutable BEFORE DELETE OR UPDATE ON public.platform_tenant_wipe_audit FOR EACH ROW EXECUTE FUNCTION public.platform_tenant_wipe_audit_immutable();

--
-- Name: account_login_event account_login_event_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_login_event
    ADD CONSTRAINT account_login_event_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: account_login_event account_login_event_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_login_event
    ADD CONSTRAINT account_login_event_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE SET NULL;

--
-- Name: account_oauth account_oauth_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_oauth
    ADD CONSTRAINT account_oauth_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: agent agent_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT agent_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: anomaly_score anomaly_score_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomaly_score
    ADD CONSTRAINT anomaly_score_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id);

--
-- Name: anomaly_score anomaly_score_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomaly_score
    ADD CONSTRAINT anomaly_score_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: approval approval_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: approval_channel approval_channel_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_channel
    ADD CONSTRAINT approval_channel_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: approval_delegate approval_delegate_granted_by_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegate
    ADD CONSTRAINT approval_delegate_granted_by_membership_id_fkey FOREIGN KEY (granted_by_membership_id) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: approval_delegate approval_delegate_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegate
    ADD CONSTRAINT approval_delegate_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: approval_delegate approval_delegate_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_delegate
    ADD CONSTRAINT approval_delegate_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: approval approval_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id);

--
-- Name: approval approval_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: approval_vote approval_vote_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_vote
    ADD CONSTRAINT approval_vote_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approval(approval_id) ON DELETE CASCADE;

--
-- Name: approval_vote approval_vote_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_vote
    ADD CONSTRAINT approval_vote_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: approval_vote approval_vote_voter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_vote
    ADD CONSTRAINT approval_vote_voter_user_id_fkey FOREIGN KEY (voter_user_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: artifact artifact_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id);

--
-- Name: artifact artifact_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: audit_log audit_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: auditor_access_log auditor_access_log_invite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditor_access_log
    ADD CONSTRAINT auditor_access_log_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.auditor_invite(invite_id) ON DELETE CASCADE;

--
-- Name: auditor_access_log auditor_access_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditor_access_log
    ADD CONSTRAINT auditor_access_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: auditor_invite auditor_invite_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditor_invite
    ADD CONSTRAINT auditor_invite_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: authority_matrix authority_matrix_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authority_matrix
    ADD CONSTRAINT authority_matrix_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: bank_case bank_case_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_case
    ADD CONSTRAINT bank_case_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: bank_case bank_case_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_case
    ADD CONSTRAINT bank_case_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.governed_workflow(workflow_id) ON DELETE SET NULL;

--
-- Name: bank_role_ladder bank_role_ladder_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_role_ladder
    ADD CONSTRAINT bank_role_ladder_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: compliance_export compliance_export_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export
    ADD CONSTRAINT compliance_export_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: compliance_export compliance_export_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export
    ADD CONSTRAINT compliance_export_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: compliance_export_schedule compliance_export_schedule_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_export_schedule
    ADD CONSTRAINT compliance_export_schedule_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: did_document did_document_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_document
    ADD CONSTRAINT did_document_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;

--
-- Name: did_document did_document_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_document
    ADD CONSTRAINT did_document_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: email_verification_token email_verification_token_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_token
    ADD CONSTRAINT email_verification_token_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: event event_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id);

--
-- Name: event event_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.signing_key(key_id);

--
-- Name: event event_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: event event_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.event(event_id);

--
-- Name: event event_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.policy(policy_id);

--
-- Name: event event_span_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_span_id_fkey FOREIGN KEY (span_id) REFERENCES public.span(span_id);

--
-- Name: event event_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.trace(trace_id);

--
-- Name: field_policy field_policy_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_policy
    ADD CONSTRAINT field_policy_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: forensic_checkpoint forensic_checkpoint_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_checkpoint
    ADD CONSTRAINT forensic_checkpoint_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: forensic_receipt forensic_receipt_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt
    ADD CONSTRAINT forensic_receipt_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: forensic_receipt_seq forensic_receipt_seq_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt_seq
    ADD CONSTRAINT forensic_receipt_seq_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: forensic_receipt_timestamp forensic_receipt_timestamp_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_receipt_timestamp
    ADD CONSTRAINT forensic_receipt_timestamp_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: governed_workflow governed_workflow_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governed_workflow
    ADD CONSTRAINT governed_workflow_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: idempotency_record idempotency_record_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_record
    ADD CONSTRAINT idempotency_record_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: incident_note incident_note_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_note
    ADD CONSTRAINT incident_note_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incident(incident_id) ON DELETE CASCADE;

--
-- Name: incident_note incident_note_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_note
    ADD CONSTRAINT incident_note_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: incident incident_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident
    ADD CONSTRAINT incident_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: inclusion_proof inclusion_proof_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inclusion_proof
    ADD CONSTRAINT inclusion_proof_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id);

--
-- Name: inclusion_proof inclusion_proof_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inclusion_proof
    ADD CONSTRAINT inclusion_proof_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: inclusion_proof inclusion_proof_root_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inclusion_proof
    ADD CONSTRAINT inclusion_proof_root_id_fkey FOREIGN KEY (root_id) REFERENCES public.merkle_root(root_id);

--
-- Name: ingest_api_key ingest_api_key_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_api_key
    ADD CONSTRAINT ingest_api_key_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: insurance_metric insurance_metric_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_metric
    ADD CONSTRAINT insurance_metric_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: marketing_blog_posts marketing_blog_posts_author_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_author_account_id_fkey FOREIGN KEY (author_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: marketing_blog_posts marketing_blog_posts_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: marketing_blog_posts marketing_blog_posts_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: marketing_blog_posts marketing_blog_posts_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blog_posts
    ADD CONSTRAINT marketing_blog_posts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: membership membership_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: membership_bank_role membership_bank_role_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_bank_role
    ADD CONSTRAINT membership_bank_role_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: membership_bank_role membership_bank_role_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_bank_role
    ADD CONSTRAINT membership_bank_role_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: membership membership_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT membership_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: merkle_root merkle_root_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merkle_root
    ADD CONSTRAINT merkle_root_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: newsletter_campaign_deliveries newsletter_campaign_deliveries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaign_deliveries
    ADD CONSTRAINT newsletter_campaign_deliveries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE;

--
-- Name: newsletter_campaign_deliveries newsletter_campaign_deliveries_subscriber_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_campaign_deliveries
    ADD CONSTRAINT newsletter_campaign_deliveries_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE;

--
-- Name: organization_billing_event organization_billing_event_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_billing_event
    ADD CONSTRAINT organization_billing_event_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: organization_billing_event organization_billing_event_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_billing_event
    ADD CONSTRAINT organization_billing_event_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_invitation organization_invitation_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitation
    ADD CONSTRAINT organization_invitation_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: organization_invitation organization_invitation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitation
    ADD CONSTRAINT organization_invitation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_scim_group_member organization_scim_group_member_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group_member
    ADD CONSTRAINT organization_scim_group_member_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: organization_scim_group_member organization_scim_group_member_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group_member
    ADD CONSTRAINT organization_scim_group_member_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_scim_group_member organization_scim_group_member_scim_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group_member
    ADD CONSTRAINT organization_scim_group_member_scim_group_id_fkey FOREIGN KEY (scim_group_id) REFERENCES public.organization_scim_group(scim_group_id) ON DELETE CASCADE;

--
-- Name: organization_scim_group organization_scim_group_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim_group
    ADD CONSTRAINT organization_scim_group_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_scim organization_scim_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_scim
    ADD CONSTRAINT organization_scim_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_sso organization_sso_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_sso
    ADD CONSTRAINT organization_sso_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: organization_usage_monthly organization_usage_monthly_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_monthly
    ADD CONSTRAINT organization_usage_monthly_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: password_reset_token password_reset_token_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: policy_activation_request policy_activation_request_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_activation_request
    ADD CONSTRAINT policy_activation_request_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: policy_activation_request policy_activation_request_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_activation_request
    ADD CONSTRAINT policy_activation_request_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: policy_activation_request policy_activation_request_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_activation_request
    ADD CONSTRAINT policy_activation_request_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: policy policy_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy
    ADD CONSTRAINT policy_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: policy policy_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy
    ADD CONSTRAINT policy_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: policy_publish_approval policy_publish_approval_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_publish_approval
    ADD CONSTRAINT policy_publish_approval_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: policy_publish_approval policy_publish_approval_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_publish_approval
    ADD CONSTRAINT policy_publish_approval_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: policy_publish_approval policy_publish_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_publish_approval
    ADD CONSTRAINT policy_publish_approval_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.policy(policy_id) ON DELETE CASCADE;

--
-- Name: policy_rule policy_rule_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule
    ADD CONSTRAINT policy_rule_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.policy(policy_id) ON DELETE CASCADE;

--
-- Name: receipt_access_log receipt_access_log_actor_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_access_log
    ADD CONSTRAINT receipt_access_log_actor_membership_id_fkey FOREIGN KEY (actor_membership_id) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: receipt_access_log receipt_access_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_access_log
    ADD CONSTRAINT receipt_access_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: receipt_share_token receipt_share_token_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_share_token
    ADD CONSTRAINT receipt_share_token_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: research_posts research_posts_author_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_posts
    ADD CONSTRAINT research_posts_author_account_id_fkey FOREIGN KEY (author_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: research_posts research_posts_last_edited_by_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_posts
    ADD CONSTRAINT research_posts_last_edited_by_account_id_fkey FOREIGN KEY (last_edited_by_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: research_posts research_posts_published_by_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.research_posts
    ADD CONSTRAINT research_posts_published_by_account_id_fkey FOREIGN KEY (published_by_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: score_band score_band_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_band
    ADD CONSTRAINT score_band_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: session session_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;

--
-- Name: session session_impersonator_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_impersonator_account_id_fkey FOREIGN KEY (impersonator_account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;

--
-- Name: session session_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id) ON DELETE CASCADE;

--
-- Name: session session_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: session session_parent_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_parent_session_id_fkey FOREIGN KEY (parent_session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;

--
-- Name: siem_destination siem_destination_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siem_destination
    ADD CONSTRAINT siem_destination_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: signed_event_buffer signed_event_buffer_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signed_event_buffer
    ADD CONSTRAINT signed_event_buffer_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: signing_key signing_key_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key
    ADD CONSTRAINT signing_key_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;

--
-- Name: signing_key signing_key_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key
    ADD CONSTRAINT signing_key_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: signing_key_rotation signing_key_rotation_actor_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_actor_membership_id_fkey FOREIGN KEY (actor_membership_id) REFERENCES public.membership(membership_id) ON DELETE SET NULL;

--
-- Name: signing_key_rotation signing_key_rotation_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;

--
-- Name: signing_key_rotation signing_key_rotation_new_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_new_key_id_fkey FOREIGN KEY (new_key_id) REFERENCES public.signing_key(key_id) ON DELETE CASCADE;

--
-- Name: signing_key_rotation signing_key_rotation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: signing_key_rotation signing_key_rotation_previous_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_key_rotation
    ADD CONSTRAINT signing_key_rotation_previous_key_id_fkey FOREIGN KEY (previous_key_id) REFERENCES public.signing_key(key_id) ON DELETE SET NULL;

--
-- Name: span span_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.span
    ADD CONSTRAINT span_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: span span_parent_span_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.span
    ADD CONSTRAINT span_parent_span_id_fkey FOREIGN KEY (parent_span_id) REFERENCES public.span(span_id);

--
-- Name: span span_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.span
    ADD CONSTRAINT span_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.trace(trace_id) ON DELETE CASCADE;

--
-- Name: trace trace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trace
    ADD CONSTRAINT trace_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id);

--
-- Name: trace trace_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trace
    ADD CONSTRAINT trace_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: transparency_log_entry transparency_log_entry_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transparency_log_entry
    ADD CONSTRAINT transparency_log_entry_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(event_id);

--
-- Name: transparency_log_entry transparency_log_entry_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transparency_log_entry
    ADD CONSTRAINT transparency_log_entry_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: transparency_log_entry transparency_log_entry_root_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transparency_log_entry
    ADD CONSTRAINT transparency_log_entry_root_id_fkey FOREIGN KEY (root_id) REFERENCES public.merkle_root(root_id);

--
-- Name: webhook_endpoint webhook_endpoint_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint
    ADD CONSTRAINT webhook_endpoint_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

--
-- Name: workflow_run workflow_run_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT workflow_run_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id);

--
-- Name: workflow_run workflow_run_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT workflow_run_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.signing_key(key_id);

--
-- Name: workflow_run workflow_run_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT workflow_run_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(organization_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Seeds (greenfield only — never dump live tenants into baseline)
-- ---------------------------------------------------------------------------

INSERT INTO plan_catalog (
  plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
  retention_days, self_serve, sort_order,
  list_price, list_price_detail, tagline, billing_note, marketing_highlighted
) VALUES
  (
    'free', 'Free', 10000, 3, 5, 90, false, 10,
    '$0', 'forever', 'Evaluate and demo', 'Self-serve signup · no card', false
  ),
  (
    'team', 'Team', 100000, 15, 25, 365, true, 20,
    '$299', '/ month', 'Production governance', 'Billed monthly · annual discount on request', true
  ),
  (
    'enterprise', 'Enterprise', NULL, 100, 500, 2555, false, 30,
    'Custom', 'from ~$999 / mo', 'Regulated scale', 'Annual contract · invoice or PO', false
  );

-- Platform audit_log anchor + staff home org after db:seed:bootstrap.
INSERT INTO organization (name, slug, plan, active)
VALUES ('Salanor Platform', 'salanor-platform', 'enterprise', false);

-- Platform email settings: singleton row is created on first save in the console.
-- App role must never EXECUTE platform_wipe_tenant (owner-only).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION platform_wipe_tenant(text, boolean, text) FROM aegis_app';
    EXECUTE 'REVOKE ALL ON TABLE platform_tenant_wipe_audit FROM aegis_app';
  END IF;
END
$$;

COMMIT;
