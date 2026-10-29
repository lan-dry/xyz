/** Extract business context from APS payload for contextual policy rules. */
import type { PolicyWhen } from "./amount.js";

export type PayloadContext = {
  segment?: string;
  account_type?: string;
  beneficiary?: string;
  /** Customer / account on file that the refund destination must match (§13.1). */
  customer_on_file?: string;
  expected_beneficiary?: string;
  merchant_age_days?: number;
  /** Optional risk tier label from KYC / scoring (e.g. high, medium, low). */
  risk_tier?: string;
  /** Optional external risk score from customer models (§12.5). */
  risk_score?: number;
  risk_score_source?: string;
  risk_model_name?: string;
  risk_model_version?: string;
  risk_score_at?: string;
};

function nestedRequestPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const nested = payload.request_payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return payload;
}

function readString(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return undefined;
}

export function payloadContextFromPayload(
  payload: Record<string, unknown> | undefined,
): PayloadContext {
  const request = nestedRequestPayload(payload);
  const root = payload ?? {};
  const src = request ?? root;

  const riskNested =
    src.risk_score && typeof src.risk_score === "object" && !Array.isArray(src.risk_score)
      ? (src.risk_score as Record<string, unknown>)
      : null;

  return {
    segment: normalizeSegment(
      readString(src, ["segment", "client_segment", "customer_segment", "tier"]),
    ),
    account_type: readString(src, ["account_type", "accountType", "type"]),
    beneficiary: readString(src, [
      "beneficiary",
      "recipient",
      "beneficiary_id",
      "recipient_id",
      "payee",
      "merchant_id",
    ]),
    customer_on_file: readString(src, [
      "customer_on_file",
      "customer_id",
      "customer_account",
      "account_on_file",
    ]),
    expected_beneficiary: readString(src, [
      "expected_beneficiary",
      "customer_on_file",
      "customer_id",
    ]),
    merchant_age_days: readNumber(src, [
      "merchant_age_days",
      "merchantAgeDays",
      "account_age_days",
      "days_since_onboarded",
    ]),
    risk_tier: readString(src, [
      "risk_tier",
      "riskTier",
      "kyc_risk_tier",
      "risk_level",
    ])?.toLowerCase(),
    risk_score: readNumber(riskNested ?? src, ["value", "score", "risk_score"]),
    risk_score_source: readString(riskNested ?? src, [
      "source",
      "risk_score_source",
      "model_source",
    ]),
    risk_model_name: readString(riskNested ?? src, [
      "model_name",
      "model",
      "risk_model_name",
    ]),
    risk_model_version: readString(riskNested ?? src, [
      "model_version",
      "version",
      "risk_model_version",
    ]),
    risk_score_at: readString(riskNested ?? src, [
      "timestamp",
      "scored_at",
      "risk_score_at",
    ]),
  };
}

/** Map legacy pilot "retail" → standard for tier demo. */
function normalizeSegment(segment: string | undefined): string | undefined {
  if (!segment) return undefined;
  const s = segment.toLowerCase();
  if (s === "retail") return "standard";
  return s;
}

export function matchesPolicyWhen(
  when: PolicyWhen | undefined,
  ctx: PayloadContext,
): boolean {
  if (!when) {
    return true;
  }

  if (when.segment) {
    const want = normalizeSegment(when.segment) ?? when.segment.toLowerCase();
    if (!ctx.segment || ctx.segment !== want) {
      return false;
    }
  }
  if (when.segments?.length) {
    const seg = ctx.segment;
    const wants = when.segments
      .map((s) => normalizeSegment(s) ?? s.toLowerCase())
      .filter(Boolean);
    if (!seg || !wants.includes(seg)) {
      return false;
    }
  }
  if (when.account_type) {
    if (
      !ctx.account_type ||
      ctx.account_type.toLowerCase() !== when.account_type.toLowerCase()
    ) {
      return false;
    }
  }
  if (when.account_types?.length) {
    const at = ctx.account_type?.toLowerCase();
    if (!at || !when.account_types.some((t) => t.toLowerCase() === at)) {
      return false;
    }
  }
  if (when.beneficiary) {
    if (
      !ctx.beneficiary ||
      ctx.beneficiary.toLowerCase() !== when.beneficiary.toLowerCase()
    ) {
      return false;
    }
  }
  if (when.beneficiaries?.length) {
    const ben = ctx.beneficiary?.toLowerCase();
    if (!ben || !when.beneficiaries.some((b) => b.toLowerCase() === ben)) {
      return false;
    }
  }
  if (when.merchant_age_days_lt != null) {
    if (
      ctx.merchant_age_days == null ||
      !(ctx.merchant_age_days < Number(when.merchant_age_days_lt))
    ) {
      return false;
    }
  }
  if (when.merchant_age_days_lte != null) {
    if (
      ctx.merchant_age_days == null ||
      !(ctx.merchant_age_days <= Number(when.merchant_age_days_lte))
    ) {
      return false;
    }
  }
  if (when.risk_tier) {
    if (
      !ctx.risk_tier ||
      ctx.risk_tier.toLowerCase() !== when.risk_tier.toLowerCase()
    ) {
      return false;
    }
  }
  return true;
}
