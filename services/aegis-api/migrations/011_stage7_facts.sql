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
