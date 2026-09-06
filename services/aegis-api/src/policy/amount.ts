/** Extract USD amount from APS payload (convention: amount_usd preferred). */
export function amountUsdFromPayload(
  payload: Record<string, unknown> | undefined,
): number | undefined {
  if (!payload) {
    return undefined;
  }
  const nested = payload.request_payload;
  const sources: Record<string, unknown>[] = [payload];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    sources.unshift(nested as Record<string, unknown>);
  }
  for (const source of sources) {
    const raw =
      source.amount_usd ?? source.amountUSD ?? source.amount ?? source.value_usd;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string") {
      const n = Number.parseFloat(raw);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return undefined;
}

export type PolicyWhen = {
  segment?: string;
  segments?: string[];
  account_type?: string;
  account_types?: string[];
  beneficiary?: string;
  beneficiaries?: string[];
};

export type PolicyConditions = {
  rule_type?: string;
  max_amount_usd?: number;
  min_amount_usd?: number;
  window_hours?: number;
  /** When set, amount rules apply only if payload context matches. */
  when?: PolicyWhen;
  /** Blocklisted beneficiary values (exact match, case-insensitive). */
  blocked_beneficiaries?: string[];
};

export function parseConditions(
  conditions: unknown,
): PolicyConditions | null {
  if (!conditions || typeof conditions !== "object") {
    return null;
  }
  return conditions as PolicyConditions;
}
