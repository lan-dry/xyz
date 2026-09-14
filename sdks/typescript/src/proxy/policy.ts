import type { PolicyDecision } from "../types.js";

/** Local fallback when policy API is unavailable (tests only). */
export const DENIED_TOOL_NAMES = new Set(["stripe.paymentIntents.create"]);

export function evaluateToolPolicyLocal(toolName: string): PolicyDecision {
  return DENIED_TOOL_NAMES.has(toolName) ? "deny" : "allow";
}
