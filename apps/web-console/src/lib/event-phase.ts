/** Maps APS action_kind to marketing “atomic event” phase within a span. */
export type EventPhase =
  | "input"
  | "output"
  | "policy"
  | "governance"
  | "approval"
  | "audit";

export function eventPhase(actionKind: string): EventPhase {
  switch (actionKind) {
    case "tool_call":
    case "llm_invocation":
    case "data_access":
      return "input";
    case "result":
      return "output";
    case "policy_decision":
      return "policy";
    case "provenance_claim":
    case "decision":
      return "governance";
    case "human_approval":
      return "approval";
    default:
      return "audit";
  }
}

export function eventPhaseLabel(phase: EventPhase): string {
  switch (phase) {
    case "input":
      return "Input";
    case "output":
      return "Output";
    case "policy":
      return "Policy";
    case "governance":
      return "Governance";
    case "approval":
      return "Approval";
    case "audit":
      return "Audit";
  }
}

export function eventPhaseHint(actionKind: string): string {
  switch (actionKind) {
    case "tool_call":
      return "Request / arguments (before side effects)";
    case "result":
      return "Outcome of a prior tool call";
    case "llm_invocation":
      return "Model request / response boundary";
    case "policy_decision":
      return "OPA or policy engine evaluation";
    case "provenance_claim":
      return "Signed authority assertion";
    case "decision":
      return "Agent or system decision record";
    case "data_access":
      return "Read or write to governed data";
    case "human_approval":
      return "Human approve / deny";
    default:
      return actionKind;
  }
}
