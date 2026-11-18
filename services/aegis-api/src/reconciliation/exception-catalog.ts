/**
 * Plain-language titles and default severities for Stage 4 exception kinds.
 */
import type {
  ExceptionSeverity,
  ReconciliationExceptionKind,
} from "./types.js";

export const EXCEPTION_CATALOG: Record<
  ReconciliationExceptionKind,
  { title: string; severity: ExceptionSeverity }
> = {
  executed_without_receipt: {
    title: "Money moved with no approval record",
    severity: "critical",
  },
  receipt_without_execution: {
    title: "Approved but no matching execution in the feed",
    severity: "high",
  },
  amount_mismatch: {
    title: "Execution amount does not match the approved amount",
    severity: "critical",
  },
  beneficiary_mismatch: {
    title: "Beneficiary does not match what was approved",
    severity: "critical",
  },
  executed_after_stop: {
    title: "Money moved after the case was stopped",
    severity: "critical",
  },
  executed_after_expiry: {
    title: "Money moved after the decision token expired",
    severity: "critical",
  },
  approver_same_as_requester: {
    title: "The same person requested and approved",
    severity: "high",
  },
  sequence_gap: {
    title: "A gap in the source event sequence",
    severity: "high",
  },
  source_silent: {
    title: "A source has been silent longer than expected",
    severity: "medium",
  },
  below_required_grade_past_deadline: {
    title: "Evidence grade still below the required level past the deadline",
    severity: "high",
  },
  db_change_without_event: {
    title: "Database change without a corresponding event (Stage 6)",
    severity: "high",
  },
  plausibility_flag: {
    title: "Plausibility check flagged this case (Stage 7)",
    severity: "medium",
  },
};

export function catalogFor(kind: ReconciliationExceptionKind) {
  return EXCEPTION_CATALOG[kind];
}
