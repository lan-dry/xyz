/** B-202 lite: normalize provenance fields for policy + console (view model). */
export function enrichProvenancePayload(input: {
  payload: Record<string, unknown>;
  toolName?: string | null;
  actionKind: string;
  policyId?: string | null;
}): Record<string, unknown> {
  const out = { ...input.payload };

  const tool = input.toolName?.trim() ?? "";
  if (!str(out.provider) && tool.includes(".")) {
    out.provider = tool.split(".")[0];
  }
  if (!str(out.provider) && input.actionKind === "llm_invocation") {
    out.provider = "llm";
  }

  if (!str(out.action)) {
    out.action =
      str(out.purpose) ??
      str(out.action_description) ??
      (tool ? tool.split(".").slice(1).join(".") || tool : null) ??
      input.actionKind.replace(/_/g, " ");
  }

  if (out.amount_usd === undefined && out.amount !== undefined) {
    const amount = num(out.amount);
    if (amount !== null) {
      out.amount_usd = amount;
    }
  }

  if (!str(out.currency) && out.amount_usd !== undefined) {
    out.currency = "USD";
  }

  if (!str(out.authority)) {
    if (input.policyId && input.policyId !== "none") {
      out.authority = `policy:${input.policyId}`;
    } else if (str(out.trigger_source)) {
      out.authority = `trigger:${out.trigger_source}`;
    }
  }

  const missing: string[] = [];
  if (input.actionKind === "tool_call" && out.amount_usd === undefined) {
    missing.push("amount_usd");
  }
  if (!str(out.trigger_source) && input.actionKind !== "human_approval") {
    missing.push("trigger_source");
  }
  if (missing.length > 0) {
    out._provenance_hints = missing;
  }

  return out;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) {
    return v.trim();
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
