-- Stage 6: independent capture — collector CDC events (source kind collector).

CREATE TABLE collector_cdc_event (
  event_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  source_id text NOT NULL,
  key_id text NOT NULL,
  case_id text,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  operation text NOT NULL
    CHECK (operation = ANY (ARRAY[
      'insert'::text, 'update'::text, 'delete'::text, 'truncate'::text
    ])),
  row_key jsonb NOT NULL,
  new_values_hash text NOT NULL DEFAULT '',
  lsn text NOT NULL,
  envelope_seq bigint NOT NULL,
  event_hash text NOT NULL,
  idempotency_key text NOT NULL,
  captured_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  matched_case_id text,
  matched_at timestamptz,
  UNIQUE (organization_id, source_id, idempotency_key)
);

CREATE INDEX collector_cdc_event_org_case_idx
  ON collector_cdc_event (organization_id, case_id, captured_at);

CREATE INDEX collector_cdc_event_org_period_idx
  ON collector_cdc_event (organization_id, captured_at);

CREATE INDEX collector_cdc_event_unmatched_idx
  ON collector_cdc_event (organization_id, captured_at)
  WHERE matched_case_id IS NULL;

-- Sealed fields are immutable; reconciliation may only set matched_*.
CREATE OR REPLACE FUNCTION public.aegis_collector_cdc_match_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'collector_cdc_event rows cannot be deleted';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.key_id IS DISTINCT FROM OLD.key_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.schema_name IS DISTINCT FROM OLD.schema_name
     OR NEW.table_name IS DISTINCT FROM OLD.table_name
     OR NEW.operation IS DISTINCT FROM OLD.operation
     OR NEW.row_key IS DISTINCT FROM OLD.row_key
     OR NEW.new_values_hash IS DISTINCT FROM OLD.new_values_hash
     OR NEW.lsn IS DISTINCT FROM OLD.lsn
     OR NEW.envelope_seq IS DISTINCT FROM OLD.envelope_seq
     OR NEW.event_hash IS DISTINCT FROM OLD.event_hash
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
     OR NEW.ingested_at IS DISTINCT FROM OLD.ingested_at
  THEN
    RAISE EXCEPTION 'collector_cdc_event sealed fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_collector_cdc_event_match_guard
  BEFORE UPDATE OR DELETE ON collector_cdc_event
  FOR EACH ROW EXECUTE FUNCTION public.aegis_collector_cdc_match_guard();

-- Tenant wipe: collector events before sources.
CREATE OR REPLACE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT ARRAY[
    'receipt_access_log',
    'reconciliation_exception_note',
    'reconciliation_exception',
    'reconciliation_feed_row',
    'reconciliation_run',
    'reconciliation_feed',
    'collector_cdc_event',
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
    'organization_setting_change',
    'source_envelope_idempotency',
    'source_sequence_gap',
    'source_nonce',
    'source_registry_event',
    'source_key',
    'source'
  ]::text[];
$$;
