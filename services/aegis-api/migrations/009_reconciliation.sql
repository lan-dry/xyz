-- Stage 4: reconciliation feeds, runs, exceptions, and sealed reports.

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
          'break_glass'::text,
          'reconciliation_report'::text
        ]
      )
    );

-- Optional expected silence interval on a registered source (source_silent).
ALTER TABLE source
  ADD COLUMN IF NOT EXISTS expected_interval_sec integer
    CHECK (expected_interval_sec IS NULL OR expected_interval_sec > 0);

CREATE TABLE reconciliation_feed (
  feed_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  name text NOT NULL,
  source_id text,
  match_key text NOT NULL
    CHECK (match_key = ANY (ARRAY['case_id'::text, 'token_id'::text])),
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_interval_sec integer
    CHECK (expected_interval_sec IS NULL OR expected_interval_sec > 0),
  schedule_enabled boolean NOT NULL DEFAULT true,
  schedule_hour_utc integer NOT NULL DEFAULT 2
    CHECK (schedule_hour_utc BETWEEN 0 AND 23),
  last_scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX reconciliation_feed_org_idx
  ON reconciliation_feed (organization_id, status);

CREATE TABLE reconciliation_feed_row (
  row_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  feed_id text NOT NULL REFERENCES reconciliation_feed(feed_id) ON DELETE CASCADE,
  external_id text NOT NULL,
  case_id text,
  token_id text,
  amount text,
  currency text,
  beneficiary_account text,
  executed_at timestamptz,
  raw jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  previous_content_hash text,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feed_id, external_id, content_hash)
);

CREATE INDEX reconciliation_feed_row_current_idx
  ON reconciliation_feed_row (organization_id, feed_id, external_id)
  WHERE is_current;

CREATE INDEX reconciliation_feed_row_case_idx
  ON reconciliation_feed_row (organization_id, case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX reconciliation_feed_row_token_idx
  ON reconciliation_feed_row (organization_id, token_id)
  WHERE token_id IS NOT NULL;

CREATE TABLE reconciliation_run (
  run_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  feed_id text REFERENCES reconciliation_feed(feed_id) ON DELETE SET NULL,
  trigger text NOT NULL
    CHECK (trigger = ANY (ARRAY['on_demand'::text, 'scheduled'::text])),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])),
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_feed_count integer NOT NULL DEFAULT 0,
  unmatched_receipt_count integer NOT NULL DEFAULT 0,
  exception_count integer NOT NULL DEFAULT 0,
  report jsonb,
  report_receipt_id text,
  report_receipt_hash text,
  error text,
  created_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (period_end > period_start)
);

CREATE INDEX reconciliation_run_org_started_idx
  ON reconciliation_run (organization_id, started_at DESC);

CREATE TABLE reconciliation_exception (
  exception_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  kind text NOT NULL
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
          'plausibility_flag'::text
        ]
      )
    ),
  severity text NOT NULL
    CHECK (severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])),
  title text NOT NULL,
  source_name text,
  case_id text,
  token_id text,
  feed_id text,
  feed_row_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_run_id text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_run_id text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  acknowledge_note text,
  resolved_at timestamptz,
  resolved_by text,
  resolve_note text,
  UNIQUE (organization_id, fingerprint)
);

CREATE INDEX reconciliation_exception_org_status_idx
  ON reconciliation_exception (organization_id, status, first_seen_at DESC);

CREATE INDEX reconciliation_exception_org_case_idx
  ON reconciliation_exception (organization_id, case_id);

CREATE TABLE reconciliation_exception_note (
  note_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
  exception_id text NOT NULL REFERENCES reconciliation_exception(exception_id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action = ANY (ARRAY['acknowledged'::text, 'resolved'::text, 'note'::text])),
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reconciliation_exception_note_ex_idx
  ON reconciliation_exception_note (organization_id, exception_id, created_at);

-- Status / note fields may change; identity and kind stay fixed.
CREATE OR REPLACE FUNCTION public.aegis_reconciliation_exception_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reconciliation_exception rows cannot be deleted';
  END IF;
  IF NEW.exception_id IS DISTINCT FROM OLD.exception_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
     OR NEW.first_seen_run_id IS DISTINCT FROM OLD.first_seen_run_id
  THEN
    RAISE EXCEPTION 'reconciliation_exception sealed fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reconciliation_exception_update_guard
  BEFORE UPDATE OR DELETE ON reconciliation_exception
  FOR EACH ROW EXECUTE FUNCTION public.aegis_reconciliation_exception_update_guard();

CREATE TRIGGER trg_reconciliation_exception_note_append_only
  BEFORE DELETE OR UPDATE ON reconciliation_exception_note
  FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_receipt_mutation();

CREATE TRIGGER trg_reconciliation_run_append_only
  BEFORE DELETE ON reconciliation_run
  FOR EACH ROW EXECUTE FUNCTION public.aegis_forbid_receipt_mutation();

-- Tenant wipe: children first (notes → exceptions → rows → runs → feeds).
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
