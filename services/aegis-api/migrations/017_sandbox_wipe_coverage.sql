-- Sandbox audit rows are tenant-scoped (organization_id) and must be wiped with the tenant.
-- Access requests are platform intake: clear the org pointer on wipe via ON DELETE SET NULL.

ALTER TABLE sandbox_access_request
  DROP CONSTRAINT IF EXISTS sandbox_access_request_created_organization_id_fkey;

ALTER TABLE sandbox_access_request
  ADD CONSTRAINT sandbox_access_request_created_organization_id_fkey
  FOREIGN KEY (created_organization_id)
  REFERENCES organization (organization_id)
  ON DELETE SET NULL;

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
    'platform_sandbox_audit',
    'source_envelope_idempotency',
    'source_sequence_gap',
    'source_nonce',
    'source_registry_event',
    'source_key',
    'source'
  ]::text[];
$$;
