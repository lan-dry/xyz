/**
 * Configurable checks that refuse events looking like real customer PII in sandboxes.
 * Patterns are conservative; operators can extend via SANDBOX_SYNTHETIC_EXTRA_REGEX (comma-separated).
 */

export type SyntheticReject = {
  code: "synthetic_data_required";
  message: string;
  field: string;
};

const CARDISH =
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/;
/** Rough national-id shaped tokens (long digit runs) — sandbox must use clearly fake ids. */
const LONG_DIGIT_ID = /\b\d{10,}\b/;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i;
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
]);
const IDENTITY_FIELD =
  /(^|\.)(national_?id|passport|ssn|nin|tax_?id|id_number|customer_id_number)(\.|$)/i;
const PHONE_FIELD = /(^|\.)(phone|mobile|msisdn|tel)(\.|$)/i;
const SYNTHETIC_PREFIX = /^(TEST|DEMO|SYN|FAKE|\+000)/i;

export type SandboxOrgGate = {
  tenant_kind: string;
  sandbox_archived_at?: Date | string | null;
  sandbox_read_only_until?: Date | string | null;
};

export type SandboxIngestBlock = {
  status: 403 | 422;
  error: string;
  code: string;
  message: string;
  field?: string;
};

/** Refuse archived, read-only, or non-synthetic payloads for sandbox tenants. */
export function blockSandboxIngest(
  org: SandboxOrgGate | null | undefined,
  payload: unknown,
): SandboxIngestBlock | null {
  if (!org) return null;
  if (org.sandbox_archived_at) {
    return {
      status: 403,
      error: "sandbox_archived",
      code: "sandbox_archived",
      message: "This sandbox has been archived and no longer accepts events.",
    };
  }
  if (
    org.sandbox_read_only_until &&
    new Date(org.sandbox_read_only_until).getTime() > Date.now()
  ) {
    return {
      status: 403,
      error: "sandbox_read_only",
      code: "sandbox_read_only",
      message:
        "This sandbox is past its expiry date and is read-only for a short grace period.",
    };
  }
  if (org.tenant_kind === "sandbox") {
    const syn = rejectNonSyntheticPayload(payload);
    if (syn) {
      return {
        status: 422,
        error: syn.code,
        code: syn.code,
        message: syn.message,
        field: syn.field,
      };
    }
  }
  return null;
}

function walk(
  value: unknown,
  path: string,
  hit: (field: string, reason: string) => void,
): void {
  if (value == null) return;
  if (typeof value === "string") {
    const email = value.match(EMAIL_IN_TEXT);
    if (email && PERSONAL_EMAIL_DOMAINS.has(email[1].toLowerCase())) {
      hit(path || "body", "personal email domain; use a synthetic address such as officer@demo.test");
    }
    if (CARDISH.test(value.replace(/[\s-]/g, ""))) {
      hit(path || "body", "looks like a payment card number");
    }
    const extras = (process.env.SANDBOX_SYNTHETIC_EXTRA_REGEX ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const src of extras) {
      try {
        if (new RegExp(src, "i").test(value)) {
          hit(path || "body", "matches a sandbox synthetic-data rule");
        }
      } catch {
        /* ignore bad regex in env */
      }
    }
    if (IDENTITY_FIELD.test(path) || path.includes("national") || path.includes("ssn") || path.includes("nin")) {
      if (LONG_DIGIT_ID.test(value) && !SYNTHETIC_PREFIX.test(value)) {
        hit(path, "looks like a real national id; use a TEST- or DEMO- prefixed value");
      }
    }
    if (PHONE_FIELD.test(path) && LONG_DIGIT_ID.test(value.replace(/[\s()+-]/g, "")) && !SYNTHETIC_PREFIX.test(value)) {
      hit(path, "looks like a real phone number; use a TEST- or +000 prefixed value");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, hit));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, hit);
    }
  }
}

export function rejectNonSyntheticPayload(
  payload: unknown,
): SyntheticReject | null {
  let found: SyntheticReject | null = null;
  walk(payload, "", (field, reason) => {
    if (!found) {
      found = {
        code: "synthetic_data_required",
        field,
        message: `Sandbox only accepts synthetic data (${reason} in ${field || "the event"}).`,
      };
    }
  });
  return found;
}
