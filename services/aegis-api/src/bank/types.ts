import type { BankOutcome } from "./outcome.js";

export type BankEventType =
  | "loan_decision"
  | "payment_transfer"
  | "data_access"
  | "policy_publish"
  | "generic";

/** Bank event intake schema (R1). Machine-readable 400 on validation failure. */
export type BankEvent = {
  schema_version: 1;
  case_id: string;
  idempotency_key: string;
  event_type: BankEventType | string;
  product?: string;
  workflow_id?: string;
  agent_id?: string;
  emitted_at: string;
  actor?: {
    type?: "system" | "human" | "agent";
    id?: string;
    role?: string;
  };
  attributes: Record<string, unknown>;
  /** Optional client-supplied correlation; else generated. */
  trace_id?: string;
};

export type BankDecisionResponse = {
  case_id: string;
  decision_id: string;
  receipt_id: string;
  outcome: BankOutcome;
  mode: "enforce" | "record_only";
  /** Present when mode is record_only and outcome would have blocked. */
  would_have?: BankOutcome;
  matched_rules: Array<{
    rule_id: string;
    policy_id: string;
    decision: string;
  }>;
  decision_basis?: {
    outcome: string;
    decided_by_rule_id: string | null;
    explanation: string;
    matched: Array<{
      rule_id: string;
      policy_id: string;
      decision: string;
      effect: string;
      note?: string;
    }>;
  };
  plain_summary?: string;
  policy?: {
    policy_id: string;
    version: number;
    content_hash: string | null;
  };
  approval?: {
    required_roles: string[];
    approval_id: string | null;
  } | null;
  event_id: string | null;
  event_hash: string | null;
  sequence_num: number | null;
  /** Present on decisions made from a verified source envelope (Stage 1 provenance). */
  source_signed?: boolean;
  evidence_grade?: "G1";
  flags?: {
    /** Historical only — new decisions never set this (demo clock removed). */
    demo_clock?: boolean;
    decided_without_aegis?: boolean;
    provisional?: boolean;
    /** F13: evidence / receipt write failed — not a final enforceable decision. */
    evidence_status?: "ok" | "failed";
  };
};

export type BankValidationErrorBody = {
  error: "validation_error";
  code: string;
  message: string;
  fields?: Array<{ path: string; code: string; message: string }>;
};
