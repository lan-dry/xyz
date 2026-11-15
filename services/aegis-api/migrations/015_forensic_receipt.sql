-- Phase 2: derived forensic receipts (cite sealed events; one chain of truth).
-- Append-only triggers for seal fields; retention purge still redacts payload only.

CREATE TABLE IF NOT EXISTS forensic_receipt (
  receipt_id        TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  seq               BIGINT NOT NULL,
  prev_hash         TEXT,
  receipt_hash      TEXT NOT NULL,
  case_id           TEXT,
  decision_id       TEXT NOT NULL,
  outcome           TEXT NOT NULL
    CHECK (outcome IN ('allow', 'hold', 'stop', 'expired', 'approved')),
  mode              TEXT NOT NULL DEFAULT 'enforce'
    CHECK (mode IN ('enforce', 'record_only')),
  body              JSONB NOT NULL,
  key_id            TEXT NOT NULL,
  sig_alg           TEXT NOT NULL DEFAULT 'ed25519',
  sig_value_b64     TEXT NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_forensic_receipt_org_case
  ON forensic_receipt (organization_id, case_id);

CREATE INDEX IF NOT EXISTS idx_forensic_receipt_org_issued
  ON forensic_receipt (organization_id, issued_at DESC);

COMMENT ON TABLE forensic_receipt IS
  'Derived forensic receipt; body.sealed_events cite APS-1 event_id/hash/sequence. Not a second chain.';

-- Checkpoint head for tenant receipt sequence
CREATE TABLE IF NOT EXISTS forensic_checkpoint (
  checkpoint_id     TEXT PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  seq               BIGINT NOT NULL,
  head_hash         TEXT NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  key_id            TEXT NOT NULL,
  sig_alg           TEXT NOT NULL DEFAULT 'ed25519',
  sig_value_b64     TEXT NOT NULL,
  tsa_token_b64     TEXT,
  body              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_forensic_checkpoint_org
  ON forensic_checkpoint (organization_id, issued_at DESC);

-- Access log for receipt views (R9 / section C)
CREATE TABLE IF NOT EXISTS receipt_access_log (
  access_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  receipt_id        TEXT NOT NULL,
  actor_membership_id UUID REFERENCES membership (membership_id) ON DELETE SET NULL,
  actor_email       TEXT,
  action            TEXT NOT NULL DEFAULT 'view',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_access_org
  ON receipt_access_log (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only: block destructive mutation of seal columns on event
-- Retention purge redacts payload / sets purged_at — those columns remain writable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aegis_forbid_event_seal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append_only: sealed event rows cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Seal identity + hash chain only. Payload may be redacted (retention);
  -- sig may be refreshed by legacy resign paths. event_hash/sequence stay fixed.
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
     OR NEW.event_hash IS DISTINCT FROM OLD.event_hash
     OR NEW.sequence_num IS DISTINCT FROM OLD.sequence_num
     OR NEW.prev_event_hash IS DISTINCT FROM OLD.prev_event_hash
  THEN
    RAISE EXCEPTION 'append_only: sealed event identity/hash chain fields are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_append_only ON event;
CREATE TRIGGER trg_event_append_only
  BEFORE UPDATE OR DELETE ON event
  FOR EACH ROW
  EXECUTE FUNCTION aegis_forbid_event_seal_mutation();

CREATE OR REPLACE FUNCTION aegis_forbid_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append_only: forensic receipts cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'append_only: forensic receipts cannot be updated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forensic_receipt_append_only ON forensic_receipt;
CREATE TRIGGER trg_forensic_receipt_append_only
  BEFORE UPDATE OR DELETE ON forensic_receipt
  FOR EACH ROW
  EXECUTE FUNCTION aegis_forbid_receipt_mutation();
