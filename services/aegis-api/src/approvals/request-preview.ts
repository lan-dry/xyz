/** Extract business context from a policy gate event for approvers. */
export type RequestPreview = {
  amount_usd?: number;
  summary?: string;
  fields: Array<{ key: string; value: string }>;
};

const POLICY_META_KEYS = new Set([
  "engine",
  "blocked",
  "rule_id",
  "decision",
  "policy_id",
  "rationale",
  "span_label",
  "trigger_source",
  "obligation_tool",
  "investor_summary",
  "tool_under_review",
  "deferred_request",
  "request_payload",
]);

export function requestPayloadFromEvent(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload) return null;
  const nested = payload.request_payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return null;
}

export function buildRequestPreview(
  payload: Record<string, unknown> | null | undefined,
): RequestPreview {
  const requestPayload = requestPayloadFromEvent(payload);
  if (!requestPayload) {
    return { fields: [] };
  }

  const amountRaw = requestPayload.amount_usd ?? requestPayload.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number.parseFloat(amountRaw)
        : undefined;

  const fields: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(requestPayload)) {
    if (key === "amount_usd" || key === "amount" || key === "summary") continue;
    if (value == null || typeof value === "object") continue;
    fields.push({ key, value: String(value) });
    if (fields.length >= 8) break;
  }

  const summary =
    typeof requestPayload.summary === "string" ? requestPayload.summary : undefined;

  return {
    amount_usd: Number.isFinite(amount) ? amount : undefined,
    summary,
    fields,
  };
}

export function previewFromNotifyContext(input: {
  amountUsd?: number;
  requestSummary?: string;
  requestFields?: Record<string, string>;
}): RequestPreview {
  const fields: Array<{ key: string; value: string }> = [];
  if (input.requestFields) {
    for (const [key, value] of Object.entries(input.requestFields)) {
      if (key === "amount_usd" || key === "amount" || key === "summary") continue;
      fields.push({ key, value });
    }
  }
  return {
    amount_usd: input.amountUsd,
    summary: input.requestSummary,
    fields,
  };
}

export function isPolicyMetadataKey(key: string): boolean {
  return POLICY_META_KEYS.has(key);
}
