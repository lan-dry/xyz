-- Stage 6 follow-up: value-hash mismatch between CDC and confirmed params.

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
        'db_value_mismatch'::text,
        'plausibility_flag'::text,
        'fact_mismatch'::text
      ]
    )
  );
