-- Stage 2 provenance: honest labelling. Grades can rise after a record is sealed (a later
-- reconciliation, an independent capture). Each rise is sealed as a small forensic receipt with
-- outcome 'grade_change'; this table is the queryable index over those receipts.
-- The case page reads the CURRENT grade from the sealed grade-change receipts; the grade AT SEAL
-- is inside each receipt's signed provenance block.

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
        'grade_change'::text
      ]
    )
  );

CREATE TABLE evidence_grade_change (
  grade_change_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  case_id text NOT NULL,
  from_grade text NOT NULL CHECK (from_grade IN ('G0','G1','G2','G3')),
  to_grade text NOT NULL CHECK (to_grade IN ('G0','G1','G2','G3')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  feed_name text,
  -- The sealed receipt that carries this change inside its signature.
  receipt_id text NOT NULL UNIQUE REFERENCES forensic_receipt(receipt_id),
  receipt_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Grades only rise. 'G0' < 'G1' < 'G2' < 'G3' in text order.
  CHECK (to_grade > from_grade)
);

CREATE INDEX idx_evidence_grade_change_org_case
  ON evidence_grade_change (organization_id, case_id, created_at);

-- Append-only, like the receipts it indexes.
CREATE TRIGGER trg_evidence_grade_change_append_only
  BEFORE DELETE OR UPDATE ON evidence_grade_change
  FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_receipt_mutation();

-- Tenant wipe: new tenant-scoped table goes first (it references forensic_receipt).
CREATE OR REPLACE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT ARRAY[
    'receipt_access_log',
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
