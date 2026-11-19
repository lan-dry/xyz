-- Stage 1 provenance: source registry + AEGIS-SRC1 signed envelope ingest.

-- sources
CREATE TABLE source (
  source_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organization(organization_id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('application','executor','collector','third_party')),
  owner_contact text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_seq bigint NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, source_id)
);

CREATE TABLE source_key (
  key_id text NOT NULL,
  organization_id uuid NOT NULL,
  source_id text NOT NULL,
  public_key_b64 text NOT NULL, -- 32-byte Ed25519 public key, standard base64
  valid_from timestamptz NOT NULL,
  valid_to timestamptz, -- nullable
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotated','revoked')),
  created_by text,
  revoked_by text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key_id),
  FOREIGN KEY (organization_id, source_id) REFERENCES source(organization_id, source_id)
);

-- Append-only history of registry changes (for evidence bundles)
CREATE TABLE source_registry_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_id text NOT NULL,
  key_id text,
  action text NOT NULL, -- registered|key_added|key_rotated|key_revoked|source_disabled
  actor text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nonce replay window
CREATE TABLE source_nonce (
  organization_id uuid NOT NULL,
  source_id text NOT NULL,
  nonce text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, source_id, nonce)
);
CREATE INDEX source_nonce_seen_at_idx ON source_nonce (seen_at);

-- Track sequence gaps for UI
CREATE TABLE source_sequence_gap (
  organization_id uuid NOT NULL,
  source_id text NOT NULL,
  from_seq bigint NOT NULL,
  to_seq bigint NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, source_id, from_seq)
);

-- Idempotency for source envelopes
CREATE TABLE source_envelope_idempotency (
  organization_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_id text NOT NULL,
  response_body jsonb NOT NULL,
  receipt_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key)
);

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS require_signed_events boolean NOT NULL DEFAULT false;

-- New tenants / demo: set require_signed_events=true where is_demo=true
UPDATE organization SET require_signed_events = true WHERE is_demo = true;

-- Two-person / sealed changes to org settings (require_signed_events).
-- Also ensured idempotently by ensureOrganizationSettingChangeTable() after migrate.
CREATE TABLE IF NOT EXISTS organization_setting_change (
  change_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(organization_id),
  setting_key text NOT NULL, -- 'require_signed_events'
  from_value jsonb NOT NULL,
  to_value jsonb NOT NULL,
  requested_by text NOT NULL,
  confirmed_by text,
  status text NOT NULL CHECK (status IN ('pending','applied','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS organization_setting_change_org_pending_idx
  ON organization_setting_change (organization_id, setting_key, status)
  WHERE status = 'pending';

-- Tenant wipe: new tenant-scoped tables must be in the children-first allowlist
-- (tenant-wipe-coverage test). source_key references source, so it goes first.
CREATE OR REPLACE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
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
