-- Manual + Stripe shared entitlement fields; Ops billing event ledger.
BEGIN;

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS billing_source TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_source IN ('none', 'manual', 'stripe')),
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'none'
    CHECK (billing_status IN ('none', 'pending', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

COMMENT ON COLUMN organization.billing_source IS
  'Entitlement rail: none | manual (Ops invoice) | stripe';
COMMENT ON COLUMN organization.billing_status IS
  'none | pending (invoice sent, plan still free) | active | past_due | canceled';
COMMENT ON COLUMN organization.current_period_start IS
  'Paid entitlement period start (manual or Stripe)';
COMMENT ON COLUMN organization.current_period_end IS
  'Paid entitlement period end (manual or Stripe)';

CREATE TABLE IF NOT EXISTS organization_billing_event (
  billing_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL
    CHECK (event_type IN (
      'quote_recorded',
      'invoice_noted',
      'payment_recorded',
      'plan_activated',
      'plan_downgraded',
      'period_extended'
    )),
  plan_slug            TEXT,
  external_invoice_ref TEXT,
  amount_cents         INTEGER,
  currency             TEXT,
  period_start         TIMESTAMPTZ,
  period_end           TIMESTAMPTZ,
  note                 TEXT,
  actor_account_id     UUID REFERENCES account (account_id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_billing_event_org_created_idx
  ON organization_billing_event (organization_id, created_at DESC);

COMMIT;
