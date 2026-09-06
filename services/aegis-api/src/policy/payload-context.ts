/** Extract business context from APS payload for contextual policy rules. */
import type { PolicyWhen } from "./amount.js";

export type PayloadContext = {
  segment?: string;
  account_type?: string;
  beneficiary?: string;
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

export function payloadContextFromPayload(
  payload: Record<string, unknown> | undefined,
): PayloadContext {
  const request = nestedRequestPayload(payload);
  const root = payload ?? {};
  const src = request ?? root;

  return {
    segment: readString(src, ["segment", "client_segment", "customer_segment"]),
    account_type: readString(src, ["account_type", "accountType", "type"]),
    beneficiary: readString(src, [
      "beneficiary",
      "recipient",
      "beneficiary_id",
      "recipient_id",
      "payee",
    ]),
  };
}

export function matchesPolicyWhen(
  when: PolicyWhen | undefined,
  ctx: PayloadContext,
): boolean {
  if (!when) {
    return true;
  }

  if (when.segment) {
    if (!ctx.segment || ctx.segment.toLowerCase() !== when.segment.toLowerCase()) {
      return false;
    }
  }
  if (when.segments?.length) {
    const seg = ctx.segment?.toLowerCase();
    if (!seg || !when.segments.some((s) => s.toLowerCase() === seg)) {
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
  return true;
}
