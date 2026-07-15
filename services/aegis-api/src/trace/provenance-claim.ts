export type ProvenanceClaimInput = {
  agentId: string;
  actorType: string;
  actorPrincipal: string;
  actionKind: string;
  policyDecision: string;
  toolName?: string | null;
  policyId?: string | null;
  emittedAt: string;
  payload?: unknown;
};

export type ProvenanceClaim = {
  claim: string;
  authority: string;
};

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) {
    return v.trim();
  }
  return null;
}

function resolveAuthority(input: ProvenanceClaimInput): string {
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;

  return (
    str(payload?.authority) ??
    str(payload?.acting_under) ??
    (input.policyId && input.policyId !== "none" ? `policy:${input.policyId}` : null) ??
    str(payload?.trigger_source) ??
    "agent signing key"
  );
}

function describeAction(input: ProvenanceClaimInput): string {
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;

  const action =
    str(payload?.action) ??
    str(payload?.action_description) ??
    str(payload?.purpose);

  if (input.toolName) {
    return action ? `${input.toolName} (${action})` : input.toolName;
  }
  if (action) {
    return action;
  }
  return input.actionKind.replace(/_/g, " ");
}

/** Human-readable signed assertion for auditors (not a separate signature). */
export function buildProvenanceClaim(
  input: ProvenanceClaimInput,
): ProvenanceClaim {
  const authority = resolveAuthority(input);
  const action = describeAction(input);
  const at = new Date(input.emittedAt).toISOString();
  const principal =
    input.actorType === "agent"
      ? `agent "${input.agentId}"`
      : `${input.actorType} "${input.actorPrincipal}"`;

  const claim =
    `At ${at}, ${principal} performed ${action} with policy outcome "${input.policyDecision}" under authority ${authority}.`;

  return { claim, authority };
}
