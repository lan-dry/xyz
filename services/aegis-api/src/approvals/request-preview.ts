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

const PREVIEW_SKIP_KEYS = new Set([
  "amount_usd",
  "amount",
  "summary",
  "business_context",
  "investor_summary",
  "risk_if_unmonitored",
  "trigger_detail",
  "trigger_source",
  "deferred_request",
  "request_payload",
  "obligation_tool",
  "tool_under_review",
  "engine",
  "blocked",
  "rule_id",
  "decision",
  "policy_id",
  "rationale",
  "span_label",
  "span_id",
  "provider",
  "action",
]);

function parseAmount(raw: unknown): number | undefined {
  const amount =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : undefined;
  return Number.isFinite(amount) ? amount : undefined;
}

/** Prefer nested request body; fall back to audit fields on the gate event. */
export function buildRequestPreview(
  payload: Record<string, unknown> | null | undefined,
): RequestPreview {
  if (!payload) {
    return { fields: [] };
  }

  const requestPayload = requestPayloadFromEvent(payload);
  const source: Record<string, unknown> = {
    ...payload,
    ...(requestPayload ?? {}),
  };

  const amount = parseAmount(source.amount_usd ?? source.amount);

  const fields: Array<{ key: string; value: string }> = [];
  const preferred = [
    "beneficiary",
    "customer_email",
    "order_id",
    "resource_id",
    "segment",
    "account_type",
    "currency",
    "merchant_id",
  ];
  for (const key of preferred) {
    const value = source[key];
    if (value == null || typeof value === "object") continue;
    fields.push({ key, value: String(value) });
  }
  for (const [key, value] of Object.entries(source)) {
    if (PREVIEW_SKIP_KEYS.has(key) || preferred.includes(key)) continue;
    if (value == null || typeof value === "object") continue;
    fields.push({ key, value: String(value) });
    if (fields.length >= 8) break;
  }

  const summary =
    (typeof source.summary === "string" && source.summary) ||
    (typeof source.business_context === "string" && source.business_context) ||
    (typeof source.investor_summary === "string" && source.investor_summary) ||
    undefined;

  return {
    amount_usd: amount,
    summary,
    fields: fields.slice(0, 8),
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
