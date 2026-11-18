-- A1 outcome receipts use declined / released in addition to approved.
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
        'released'::text
      ]
    )
  );
