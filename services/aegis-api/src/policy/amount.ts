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
  /** Match when payload merchant_age_days is strictly less than this value. */
  merchant_age_days_lt?: number;
  /** Match when payload merchant_age_days is less than or equal to this value. */
  merchant_age_days_lte?: number;
  /** Match when payload risk_tier equals this value (e.g. high). */
  risk_tier?: string;
};

/** Claude §12.3 — evaluation layer. Ceilings win over contextual; overrides last. */
export type PolicyLayer = "ceiling" | "contextual" | "override";

/** Claude §11.4 — where the numeric limit comes from. */
export type LimitSource = "fixed" | "segment_table" | "lookup";

export type PolicyConditions = {
  rule_type?: string;
  max_amount_usd?: number;
  min_amount_usd?: number;
  window_hours?: number;
  /** When set, amount rules apply only if payload context matches. */
  when?: PolicyWhen;
  /** Blocklisted beneficiary values (exact match, case-insensitive). */
  blocked_beneficiaries?: string[];
  /**
   * When rule_type is beneficiary_match: payload field holding the customer on file
   * (default customer_on_file, then expected_beneficiary).
   */
  expected_beneficiary_field?: string;
  /** Default contextual when omitted. */
  layer?: PolicyLayer;
  /** Default fixed when omitted. */
  limit_source?: LimitSource;
  /** Used when limit_source is segment_table (keys lowercased). */
  segment_limits?: Record<string, number>;
  /**
   * When amount or limit cannot be resolved.
   * Default: skip rule. Set allow_with_obligation to Ask a person (§11.4).
   */
  on_lookup_fail?: "skip" | "allow_with_obligation" | "deny";
};

export function parseConditions(
  conditions: unknown,
): PolicyConditions | null {
  if (!conditions || typeof conditions !== "object") {
    return null;
  }
  return conditions as PolicyConditions;
}
