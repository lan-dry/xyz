-- Stage 7: fact_mismatch exception kind + optional input-copy stub table.
-- Encrypted document copies stay off unless AEGIS_STORE_INPUT_COPIES=1.

ALTER TABLE reconciliation_exception
  DROP CONSTRAINT IF EXISTS reconciliation_exception_kind_check;

ALTER TABLE reconciliation_exception
  ADD CONSTRAINT reconciliation_exception_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'executed_without_receipt'::text,
        'receipt_without_execution'::text,
        'amount_mismatch'::text,
        'beneficiary_mismatch'::text,
        'executed_after_stop'::text,
        'executed_after_expiry'::text,
        'approver_same_as_requester'::text,
        'sequence_gap'::text,
        'source_silent'::text,
        'below_required_grade_past_deadline'::text,
        'db_change_without_event'::text,
        'plausibility_flag'::text,
        'fact_mismatch'::text
      ]
    )
  );

-- Optional durable metadata for encrypted input copies (blob itself is not required).
CREATE TABLE IF NOT EXISTS input_commitment_copy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  case_id text NOT NULL,
  name text NOT NULL,
  sha256 text NOT NULL,
  media_type text,
  ciphertext_b64 text,
  iv_b64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, case_id, name, sha256)
);

CREATE INDEX IF NOT EXISTS input_commitment_copy_org_case_idx
  ON input_commitment_copy (organization_id, case_id);

-- Tenant wipe: Stage 7 copies + Stage 1 setting-change rows.
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
    'input_commitment_copy',
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
