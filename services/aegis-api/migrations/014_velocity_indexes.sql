-- Indexes for per-customer velocity / beneficiary-history queries over sealed events.
-- Query paths: COALESCE of customer_* / account attributes in payload->'attributes'.

CREATE INDEX IF NOT EXISTS idx_event_org_customer_emitted
  ON event (
    organization_id,
    (
      COALESCE(
        payload->'attributes'->>'customer_id',
        payload->'attributes'->>'applicant_id',
        payload->'attributes'->>'account_id',
        payload->'attributes'->>'from_account',
        payload->'attributes'->>'sender_account'
      )
    ),
    emitted_at DESC
  )
  WHERE purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_org_beneficiary_emitted
  ON event (
    organization_id,
    (
      COALESCE(
        payload->'attributes'->>'beneficiary_account',
        payload->'attributes'->>'beneficiary',
        payload->'attributes'->>'beneficiary_id',
        payload->'attributes'->>'to_account'
      )
    ),
    emitted_at DESC
  )
  WHERE purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_org_channel_emitted
  ON event (
    organization_id,
    (payload->'attributes'->>'channel'),
    emitted_at DESC
  )
  WHERE purged_at IS NULL
    AND payload->'attributes'->>'channel' IS NOT NULL;
