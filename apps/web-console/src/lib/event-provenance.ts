export type EventProvenance = {
  summary: string;
  lines: Array<{ label: string; value: string }>;
};

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

/** Human-readable story from APS payload conventions (see docs/APS_PAYLOAD.md). */
export function buildEventProvenance(input: {
  tool_name: string | null;
  action_kind: string;
  policy_decision: string;
  payload: unknown;
}): EventProvenance | null {
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;

  const provider =
    str(payload?.provider) ??
    str(payload?.vendor) ??
    (input.tool_name?.split(".")[0] ?? null);
  const action =
    str(payload?.action) ??
    str(payload?.action_description) ??
    input.action_kind;
  const amount = num(payload?.amount_usd ?? payload?.amount);
  const currency = str(payload?.currency) ?? (amount !== null ? "USD" : null);
  const trigger =
    str(payload?.trigger_source) ??
    str(payload?.trigger) ??
    str(payload?.triggered_by);
  const triggerDetail = str(payload?.trigger_detail) ?? str(payload?.trigger_reason);
  const resource = str(payload?.resource_id) ?? str(payload?.transaction_id);
  const businessContext = str(payload?.business_context);
  const investorSummary = str(payload?.investor_summary);
  const riskIfUnmonitored = str(payload?.risk_if_unmonitored);
  const purpose = str(payload?.purpose);
  const dataTouched = Array.isArray(payload?.data_touched)
    ? payload.data_touched.filter((x): x is string => typeof x === "string")
    : [];

  const lines: Array<{ label: string; value: string }> = [];
  if (investorSummary) {
    lines.push({ label: "Summary", value: investorSummary });
  }
  if (businessContext) {
    lines.push({ label: "Business context", value: businessContext });
  }
  if (purpose) {
    lines.push({ label: "Purpose", value: purpose });
  }
  if (provider) {
    lines.push({ label: "Provider", value: provider });
  }
  if (input.tool_name) {
    lines.push({ label: "Tool", value: input.tool_name });
  }
  lines.push({ label: "Action", value: action });
  if (amount !== null) {
    lines.push({
      label: "Amount",
      value: currency ? `${amount} ${currency}` : String(amount),
    });
  }
  if (trigger) {
    lines.push({
      label: "Triggered by",
      value: triggerDetail ? `${trigger} — ${triggerDetail}` : trigger,
    });
  }
  if (resource) {
    lines.push({ label: "Resource", value: resource });
  }
  if (dataTouched.length > 0) {
    lines.push({ label: "Data touched", value: dataTouched.join(", ") });
  }
  if (riskIfUnmonitored) {
    lines.push({ label: "Risk if unmonitored", value: riskIfUnmonitored });
  }
  lines.push({ label: "Policy", value: input.policy_decision });

  if (lines.length <= 1 && !input.tool_name && input.action_kind !== "llm_invocation") {
    return null;
  }

  const parts: string[] = [];
  if (investorSummary) {
    parts.push(investorSummary);
  } else if (provider && amount !== null) {
    parts.push(
      `${provider} processed ${amount}${currency ? ` ${currency}` : ""}`,
    );
  } else if (provider) {
    parts.push(`${provider}: ${action}`);
  } else if (input.tool_name) {
    parts.push(`${input.tool_name}: ${action}`);
  } else {
    parts.push(action);
  }
  if (trigger) {
    parts.push(`triggered by ${trigger}${triggerDetail ? ` (${triggerDetail})` : ""}`);
  }
  parts.push(`→ ${input.policy_decision}`);

  return { summary: parts.join(" · "), lines };
}
