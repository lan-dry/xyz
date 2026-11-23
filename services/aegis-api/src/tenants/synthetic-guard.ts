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

function walk(
  value: unknown,
  path: string,
  hit: (field: string, reason: string) => void,
): void {
  if (value == null) return;
  if (typeof value === "string") {
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
    if (path.includes("national") || path.includes("ssn") || path.includes("nin")) {
      if (LONG_DIGIT_ID.test(value) && !/^(TEST|DEMO|SYN|FAKE)/i.test(value)) {
        hit(path, "looks like a real national id; use a TEST- or DEMO- prefixed value");
      }
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
