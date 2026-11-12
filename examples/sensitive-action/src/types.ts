/**
 * General sensitive-action record.
 * Any system can fill this when a governed action happens.
 * Domain fields (loan, payment, KYC, …) belong only in `context`.
 */

export type Sensitivity = "low" | "medium" | "high";

/** Plain outcomes for product and receipts. Maps to APS-1 policy_decision. */
export type ActionOutcome = "allowed" | "paused" | "blocked";

export type ApprovalRecord = {
  required: boolean;
  /** Omit or use pending when a person has not decided yet. */
  decision?: "approved" | "rejected" | "pending";
  approver?: string;
  decided_at?: string;
};

export type SensitiveAction = {
  /** What the system tried to do (plain language). */
  action: string;
  /** Object or system that was touched (e.g. application, account, invoice). */
  resource: string;
  /** Fields the agent or system actually saw. */
  fields_accessed: string[];
  sensitivity?: Sensitivity;
  /** Where the data came from (api, file, email, …). */
  source?: string;
  policy: {
    id: string;
    /** Why this outcome — shown on the receipt. */
    reason: string;
  };
  outcome: ActionOutcome;
  approval?: ApprovalRecord | null;
  /** One-line story for the sealed receipt. */
  summary: string;
  /** Optional business details. Never required by the pattern. */
  context?: Record<string, unknown>;
};

export function outcomeToPolicyDecision(
  outcome: ActionOutcome,
): "allow" | "deny" | "allow_with_obligation" {
  if (outcome === "blocked") return "deny";
  if (outcome === "paused") return "allow_with_obligation";
  return "allow";
}
