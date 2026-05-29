/** Extract USD amount from APS payload (convention: amount_usd preferred). */
export function amountUsdFromPayload(
  payload: Record<string, unknown> | undefined,
): number | undefined {
  if (!payload) {
    return undefined;
  }
  const raw =
    payload.amount_usd ?? payload.amountUSD ?? payload.amount ?? payload.value_usd;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export type PolicyConditions = {
  rule_type?: string;
  max_amount_usd?: number;
  window_hours?: number;
};

export function parseConditions(
  conditions: unknown,
): PolicyConditions | null {
  if (!conditions || typeof conditions !== "object") {
    return null;
  }
  return conditions as PolicyConditions;
}
