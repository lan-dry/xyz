-- Stage 3: decision tokens + executor confirm / break-glass exceptions.
-- Tokens bind executable params (amount, currency, beneficiary_account, product, …)
-- so the executing system cannot act on parameters that differ from what was authorised.

ALTER TABLE forensic_receipt
  DROP CONSTRAINT IF EXISTS forensic_receipt_outcome_check;

ALTER TABLE forensic_receipt
  ADD CONSTRAINT forensic_receipt_outcome_check
  CHECK (
    outcome = ANY (
      ARRAY[
        'allow'::text,
        'hold'::text,
        'stop'::text,
        'expired'::text,
        'approved'::text,
        'declined'::text,
        'released'::text,
        'grade_change'::text,
        'executed'::text,
        'execution_mismatch'::text,
        'break_glass'::text
      ]
    )
  );

-- Workflow execution binding (pack-declared).
ALTER TABLE governed_workflow
  ADD COLUMN IF NOT EXISTS execution_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE decision_token (
  token_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  case_id text NOT NULL,
  decision_id text NOT NULL,
  action_type text NOT NULL,
  params_hash text NOT NULL CHECK (params_hash ~ '^[0-9a-f]{64}$'),
  -- Bound params as presented at issue time (for mismatch field naming).
  executable_params jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  nonce text NOT NULL,
  key_id text NOT NULL,
  signature text NOT NULL,
  token_body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'issued'
    CHECK (status = ANY (ARRAY['issued'::text, 'used'::text, 'revoked'::text])),
  used_at timestamptz,
  used_by_source_id text,
  confirm_receipt_id text,
  revoked_at timestamptz,
  revoke_reason text,
  execution_control text NOT NULL DEFAULT 'observe'
    CHECK (execution_control = ANY (ARRAY['observe'::text, 'enforce'::text])),
  on_aegis_unavailable text NOT NULL DEFAULT 'allow_and_flag'
    CHECK (on_aegis_unavailable = ANY (ARRAY['allow_and_flag'::text, 'block'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX decision_token_nonce_org_idx
  ON decision_token (organization_id, nonce);

CREATE INDEX decision_token_org_case_idx
  ON decision_token (organization_id, case_id, created_at);

CREATE INDEX decision_token_org_status_idx
  ON decision_token (organization_id, status, expires_at);

-- Exception / break-glass / allow_and_flag records (Stage 4 reconciliation reads these).
CREATE TABLE execution_exception (
  exception_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  case_id text,
  token_id text REFERENCES decision_token(token_id) ON DELETE SET NULL,
  kind text NOT NULL
    CHECK (
      kind = ANY (
        ARRAY[
          'break_glass'::text,
          'allow_and_flag'::text,
          'execution_mismatch'::text,
          'token_reuse'::text,
          'token_expired'::text,
          'token_revoked'::text,
          'case_stopped'::text,
          'wrong_tenant'::text,
          'bad_signature'::text
        ]
      )
    ),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX execution_exception_org_created_idx
  ON execution_exception (organization_id, created_at DESC);

CREATE INDEX execution_exception_org_case_idx
  ON execution_exception (organization_id, case_id);

-- Status transitions (issued -> used/revoked) are allowed; sealed fields are not.
CREATE OR REPLACE FUNCTION public.aegis_decision_token_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'decision_token rows cannot be deleted';
  END IF;
  IF NEW.token_id IS DISTINCT FROM OLD.token_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.decision_id IS DISTINCT FROM OLD.decision_id
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.params_hash IS DISTINCT FROM OLD.params_hash
     OR NEW.executable_params IS DISTINCT FROM OLD.executable_params
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.nonce IS DISTINCT FROM OLD.nonce
     OR NEW.key_id IS DISTINCT FROM OLD.key_id
     OR NEW.signature IS DISTINCT FROM OLD.signature
     OR NEW.token_body IS DISTINCT FROM OLD.token_body
     OR NEW.execution_control IS DISTINCT FROM OLD.execution_control
     OR NEW.on_aegis_unavailable IS DISTINCT FROM OLD.on_aegis_unavailable
  THEN
    RAISE EXCEPTION 'decision_token sealed fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decision_token_update_guard
  BEFORE UPDATE OR DELETE ON decision_token
  FOR EACH ROW EXECUTE FUNCTION public.aegis_decision_token_update_guard();

CREATE TRIGGER trg_execution_exception_append_only
  BEFORE DELETE OR UPDATE ON execution_exception
  FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_receipt_mutation();

-- Tenant wipe: new tables first (exception references token).
CREATE OR REPLACE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT ARRAY[
    'receipt_access_log',
    'execution_exception',
    'decision_token',
    'evidence_grade_change',
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
    'webhook_endpoint',
    'source_envelope_idempotency',
    'source_sequence_gap',
    'source_nonce',
    'source_registry_event',
    'source_key',
    'source'
  ]::text[];
$$;
