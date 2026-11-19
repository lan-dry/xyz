/**
 * Stage 4 reconciliation: feeds, runs, exceptions, sealed reports.
 */

export const RECONCILIATION_EXCEPTION_KINDS = [
  "executed_without_receipt",
  "receipt_without_execution",
  "amount_mismatch",
  "beneficiary_mismatch",
  "executed_after_stop",
  "executed_after_expiry",
  "approver_same_as_requester",
  "sequence_gap",
  "source_silent",
  "below_required_grade_past_deadline",
  "db_change_without_event",
  "db_value_mismatch",
  "plausibility_flag",
  "fact_mismatch",
] as const;

export type ReconciliationExceptionKind =
  (typeof RECONCILIATION_EXCEPTION_KINDS)[number];

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";
export type ExceptionStatus = "open" | "acknowledged" | "resolved";
export type FeedMatchKey = "case_id" | "token_id";

/** Canonical fields a feed row can map into. */
export type FeedColumnTarget =
  | "case_id"
  | "token_id"
  | "amount"
  | "currency"
  | "beneficiary_account"
  | "executed_at"
  | "external_id";

/** Source column name → Aegis field. */
export type FeedColumnMapping = Partial<Record<FeedColumnTarget, string>>;

export type ReconciliationReport = {
  run_id: string;
  organization_id: string;
  feed_id: string | null;
  feed_name: string | null;
  period_start: string;
  period_end: string;
  trigger: "on_demand" | "scheduled";
  matched_count: number;
  unmatched_feed_count: number;
  unmatched_receipt_count: number;
  exception_count: number;
  exceptions: Array<{
    exception_id: string;
    kind: ReconciliationExceptionKind;
    severity: ExceptionSeverity;
    title: string;
    case_id: string | null;
    source_name: string | null;
    status: ExceptionStatus;
  }>;
  sealed_at: string;
  report_receipt_id?: string;
  report_receipt_hash?: string;
};
