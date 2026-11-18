/**
 * Requester identity from governed event attributes / payload.
 * Officer (human) or bank system account + officer id from the integration.
 */

import { formatApprover } from "./describe-decision.js";

export type RequesterIdentity = {
  email: string | null;
  officer_id: string | null;
  name: string | null;
  role: string | null;
  /** Screen / receipt label: "Patience Ingabire · Credit Officer". */
  label: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Flatten top-level + nested `attributes` (APS sealed payload). */
function layers(
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  if (!record || typeof record !== "object") return [];
  const attrs =
    record.attributes &&
    typeof record.attributes === "object" &&
    !Array.isArray(record.attributes)
      ? (record.attributes as Record<string, unknown>)
      : null;
  return attrs ? [record, attrs] : [record];
}

function firstString(
  layersIn: Record<string, unknown>[],
  keys: string[],
): string | null {
  for (const layer of layersIn) {
    for (const key of keys) {
      const v = str(layer[key]);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Read requester fields from a bank_case.attributes object or an APS event payload
 * (where identity lives under `attributes`).
 */
export function extractRequester(
  record: Record<string, unknown> | null | undefined,
): RequesterIdentity {
  const ls = layers(record);
  if (ls.length === 0) {
    return { email: null, officer_id: null, name: null, role: null, label: null };
  }

  const email = firstString(ls, [
    "requester_email",
    "officer_email",
    "on_behalf_of_email",
    "actor_email",
  ]);
  const officer_id = firstString(ls, [
    "requester_officer_id",
    "officer_id",
    "requester_id",
  ]);
  const name = firstString(ls, ["requester_name", "officer_name"]);
  const role = firstString(ls, ["requester_role", "officer_role"]);
  const systemAccount = firstString(ls, [
    "system_account",
    "bank_system_account",
    "actor_id",
  ]);

  // Prefer the human officer (name · role). Else bank system account + officer id.
  const label =
    formatApprover(name, role) ??
    (systemAccount && officer_id
      ? `${systemAccount} · ${officer_id}`
      : null) ??
    (officer_id && email ? `${email} · ${officer_id}` : null) ??
    email ??
    officer_id;

  return { email, officer_id, name, role, label };
}
