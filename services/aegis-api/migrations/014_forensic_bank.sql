-- Phase 1 forensic / bank pilot: policy combine + content_hash, record-only,
-- authority matrix, role ladder, field policy, bank case identity.
-- Defaults preserve existing tenant behaviour (combine top_priority, record_only off).

-- ---------------------------------------------------------------------------
-- Policy: opt-in all_matching combine + content hash for immutability proofs
-- ---------------------------------------------------------------------------
ALTER TABLE policy
  ADD COLUMN IF NOT EXISTS combine TEXT NOT NULL DEFAULT 'top_priority';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_combine_check'
  ) THEN
    ALTER TABLE policy
      ADD CONSTRAINT policy_combine_check
      CHECK (combine IN ('top_priority', 'all_matching'));
  END IF;
END $$;

ALTER TABLE policy
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

COMMENT ON COLUMN policy.combine IS
  'Rule combine mode. top_priority = legacy (default). all_matching = bank opt-in.';
COMMENT ON COLUMN policy.content_hash IS
  'SHA-256 of canonical policy body at publish time; sealed into decisions/receipts.';

ALTER TABLE policy
  ADD COLUMN IF NOT EXISTS dual_publish_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN policy.dual_publish_required IS
  'When true, activating requires two distinct authorised publishers. Default off.';

CREATE TABLE IF NOT EXISTS policy_publish_approval (
  approval_id     TEXT PRIMARY KEY,
  policy_id       TEXT NOT NULL REFERENCES policy (policy_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  membership_id   UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_id, membership_id)
);

-- ---------------------------------------------------------------------------
-- Workflow: record-only evaluate-and-seal without blocking (default off)
-- ---------------------------------------------------------------------------
ALTER TABLE governed_workflow
  ADD COLUMN IF NOT EXISTS record_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN governed_workflow.record_only IS
  'When true, evaluate and seal as usual but never block; receipt mode=record_only. Default false.';

-- ---------------------------------------------------------------------------
-- Bank role ladder (level checked at approval time; "or above")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_role_ladder (
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  role_key        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  level           INT NOT NULL CHECK (level >= 0),
  PRIMARY KEY (organization_id, role_key)
);

COMMENT ON TABLE bank_role_ladder IS
  'Tenant-scoped authority roles. Higher level satisfies "role or above".';

CREATE TABLE IF NOT EXISTS membership_bank_role (
  membership_id   UUID NOT NULL REFERENCES membership (membership_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  role_key        TEXT NOT NULL,
  PRIMARY KEY (membership_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_membership_bank_role_org
  ON membership_bank_role (organization_id, role_key);

-- ---------------------------------------------------------------------------
-- Authority matrix (product × amount band × risk → required role / outcome)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authority_matrix (
  matrix_id       TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  product         TEXT NOT NULL,
  amount_min      NUMERIC NOT NULL DEFAULT 0,
  amount_max      NUMERIC,
  currency        TEXT NOT NULL DEFAULT 'RWF',
  risk_tier       TEXT,
  required_role   TEXT,
  outcome         TEXT NOT NULL DEFAULT 'hold'
    CHECK (outcome IN ('allow', 'hold', 'stop')),
  rule_code       TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authority_matrix_org_product
  ON authority_matrix (organization_id, product, active)
  WHERE active = true;

COMMENT ON TABLE authority_matrix IS
  'Data-driven DoA: product × amount band × optional risk → allow/hold/stop + role.';

-- ---------------------------------------------------------------------------
-- Field policy: store | mask | hash | evaluate_only | omit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_policy (
  organization_id UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  field_path      TEXT NOT NULL,
  mode            TEXT NOT NULL
    CHECK (mode IN ('store', 'mask', 'hash', 'evaluate_only', 'omit')),
  mask_keep_last  INT NOT NULL DEFAULT 4,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, field_path)
);

COMMENT ON TABLE field_policy IS
  'Per-tenant field handling before persist/receipt. evaluate_only used for decision then omitted.';

-- ---------------------------------------------------------------------------
-- Bank case identity (idempotency + search); receipt sequence for Phase 2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_case (
  case_id           TEXT NOT NULL,
  organization_id   UUID NOT NULL REFERENCES organization (organization_id) ON DELETE CASCADE,
  idempotency_key   TEXT,
  workflow_id       TEXT REFERENCES governed_workflow (workflow_id) ON DELETE SET NULL,
  trace_id          TEXT,
  event_id          TEXT,
  decision_id       TEXT,
  receipt_id        TEXT,
  outcome           TEXT
    CHECK (outcome IS NULL OR outcome IN ('allow', 'hold', 'stop', 'expired')),
  mode              TEXT NOT NULL DEFAULT 'enforce'
    CHECK (mode IN ('enforce', 'record_only')),
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'held', 'approved', 'stopped', 'expired')),
  attributes        JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_rules     JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_id         TEXT,
  policy_version    INT,
  policy_content_hash TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, case_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_case_idempotency
  ON bank_case (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_case_org_created
  ON bank_case (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forensic_receipt_seq (
  organization_id UUID PRIMARY KEY REFERENCES organization (organization_id) ON DELETE CASCADE,
  next_seq        BIGINT NOT NULL DEFAULT 1,
  head_hash       TEXT
);

COMMENT ON TABLE forensic_receipt_seq IS
  'Per-tenant monotonic sequence for derived forensic receipts (Phase 2).';
