/**
 * API-boundary outcomes for bank / decision APIs (D2).
 * hold maps from allow_with_obligation only when the obligation is human approval.
 */

import type { PolicyDecisionResult } from "../policy/evaluate-rules.js";

export type BankOutcome = "allow" | "hold" | "stop";

export type ObligationKind = "human_approval" | "callback_verify" | "other" | string;

export function isHumanApprovalObligation(
  obligations: unknown,
): boolean {
  if (obligations == null) return true; // legacy allow_with_obligation implies human approval
  if (Array.isArray(obligations)) {
    if (obligations.length === 0) return true;
    return obligations.some(isHumanApprovalObligation);
  }
  if (typeof obligations === "object") {
    const o = obligations as Record<string, unknown>;
    const kind = String(o.kind ?? o.type ?? o.obligation ?? "").toLowerCase();
    if (!kind) return true;
    return (
      kind === "human_approval" ||
      kind === "approval" ||
      kind === "require_approval" ||
      kind === "human" ||
      kind === "ask_person"
    );
  }
  if (typeof obligations === "string") {
    const kind = obligations.toLowerCase();
    return (
      kind === "human_approval" ||
      kind === "approval" ||
      kind === "require_approval" ||
      kind === "human" ||
      kind === "ask_person"
    );
  }
  return false;
}

/**
 * Map internal policy decision to bank API outcome.
 * allow_with_obligation → hold only for human approval; otherwise allow
 * (other obligations are recorded but do not block as hold).
 */
export function toBankOutcome(
  decision: PolicyDecisionResult | string,
  obligations?: unknown,
): BankOutcome {
  if (decision === "deny") return "stop";
  if (decision === "allow_with_obligation") {
    return isHumanApprovalObligation(obligations) ? "hold" : "allow";
  }
  return "allow";
}

export function fromBankOutcome(outcome: BankOutcome): PolicyDecisionResult {
  if (outcome === "stop") return "deny";
  if (outcome === "hold") return "allow_with_obligation";
  return "allow";
}
