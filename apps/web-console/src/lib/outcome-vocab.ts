/**
 * Plain-language outcomes for risk officers (Claude §11.2–11.3).
 * Technical APS values stay available in Technical details.
 */

export type OutcomeKind =
  | "allow"
  | "stop"
  | "ask_person"
  | "approved"
  | "declined"
  | "expired"
  | "failed"
  | "running"
  | "neutral";

export type OutcomeDisplay = {
  kind: OutcomeKind;
  /** Screen wording */
  label: string;
  /** Short chip text */
  chip: string;
};

/** Map a single event policy_decision to UI wording. */
export function outcomeFromPolicyDecision(decision: string): OutcomeDisplay {
  const d = decision.trim().toLowerCase();
  switch (d) {
    case "allow":
      return { kind: "allow", label: "Allowed automatically", chip: "Allowed" };
    case "deny":
      return { kind: "stop", label: "Stopped before it ran", chip: "Stopped" };
    case "allow_with_obligation":
      return {
        kind: "ask_person",
        label: "Allowed once a person approves",
        chip: "Ask a person",
      };
    case "approved":
      return { kind: "approved", label: "Approved by a person", chip: "Approved" };
    case "rejected":
    case "denied":
      return { kind: "declined", label: "Declined by a person", chip: "Declined" };
    default:
      return { kind: "neutral", label: decision, chip: decision };
  }
}

/** Map a trace/case lifecycle status to UI wording. */
export function outcomeFromTraceStatus(
  status: string,
  opts?: { pendingApproval?: boolean; deniedEvents?: number },
): OutcomeDisplay {
  const s = status.trim().toLowerCase();
  if (s === "blocked" || opts?.pendingApproval) {
    return {
      kind: "ask_person",
      label: "Waiting for a person",
      chip: "Ask a person",
    };
  }
  if (s === "failed" || s === "expired") {
    return {
      kind: s === "expired" ? "expired" : "failed",
      label: s === "expired" ? "Expired without a decision" : "Failed",
      chip: s === "expired" ? "Expired" : "Failed",
    };
  }
  if (s === "executing" || s === "running") {
    return { kind: "running", label: "Approved: workflow in progress", chip: "Running" };
  }
  if (s === "completed") {
    if ((opts?.deniedEvents ?? 0) > 0) {
      return {
        kind: "stop",
        label: "Finished: at least one action was stopped",
        chip: "Stopped",
      };
    }
    return { kind: "allow", label: "Completed", chip: "Allowed" };
  }
  return { kind: "neutral", label: status, chip: status };
}

export function outcomeBadgeClass(
  kind: OutcomeKind,
  ui: {
    badge: string;
    badgeSuccess: string;
    badgeWarning: string;
    badgeDanger: string;
    badgeMuted: string;
    badgeDefault: string;
  },
): string {
  switch (kind) {
    case "allow":
    case "approved":
      return `${ui.badge} ${ui.badgeSuccess}`;
    case "ask_person":
    case "running":
      return `${ui.badge} ${ui.badgeWarning}`;
    case "stop":
    case "declined":
    case "expired":
    case "failed":
      return `${ui.badge} ${ui.badgeDanger}`;
    default:
      return `${ui.badge} ${ui.badgeMuted}`;
  }
}

/** Human label for action_kind on default UI. */
export function actionKindPlain(actionKind: string, toolName?: string | null): string {
  const tool = toolName?.trim();
  switch (actionKind) {
    case "tool_call":
      if (tool?.includes("trace.start")) return "Case opened";
      if (tool?.includes("trace.complete")) return "Case closed";
      return tool ? `System action: ${shortTool(tool)}` : "System action";
    case "llm_invocation":
      return "The AI reviewed";
    case "decision":
      return "The agent decided";
    case "policy_decision":
      return "Rule check";
    case "human_approval":
      return "Approved by a person";
    case "result":
      return "Outcome";
    default:
      return actionKind;
  }
}

function shortTool(tool: string): string {
  if (tool.startsWith("stripe.")) return tool.replace("stripe.", "Stripe ");
  if (tool.startsWith("aegis.")) return tool.replace("aegis.", "");
  return tool;
}

/** Approvals / inbox title: never lead with raw API tool names. */
export function toolActionPlain(toolName?: string | null): string {
  const tool = toolName?.trim() ?? "";
  if (!tool) return "Agent action";
  if (tool.includes("paymentIntents") || tool.toLowerCase().includes("refund")) {
    return "Customer refund";
  }
  if (tool.includes("payout") || tool.includes("transfer")) {
    return "Merchant payout";
  }
  if (tool.toLowerCase().includes("kyc")) return "KYC check";
  return shortTool(tool);
}

export function isBookkeepingAction(actionKind: string, toolName?: string | null): boolean {
  const tool = toolName ?? "";
  return (
    (actionKind === "tool_call" &&
      (tool.includes("trace.start") || tool.includes("trace.complete"))) ||
    actionKind === "provenance_claim"
  );
}
