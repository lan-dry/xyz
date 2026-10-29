import { createHash } from "node:crypto";

/**
 * Canonical fields human approvers bind to (Claude §13.2).
 * Changing any of these after approval invalidates the approval.
 */
const BIND_KEYS = [
  "amount_usd",
  "amount",
  "beneficiary",
  "merchant_id",
  "customer_email",
  "order_id",
  "resource_id",
  "currency",
  "segment",
  "customer_on_file",
  "expected_beneficiary",
] as const;

function pickBindable(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BIND_KEYS) {
    const value = source[key];
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

/** Normalize event / resume payload into the bindable action snapshot. */
export function actionSnapshotFromPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  const nested =
    payload.request_payload &&
    typeof payload.request_payload === "object" &&
    !Array.isArray(payload.request_payload)
      ? (payload.request_payload as Record<string, unknown>)
      : null;
  const merged = { ...payload, ...(nested ?? {}) };
  return pickBindable(merged);
}

export function digestActionSnapshot(
  snapshot: Record<string, unknown>,
): string {
  const keys = Object.keys(snapshot).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = snapshot[key];
  }
  return createHash("sha256")
    .update(JSON.stringify(normalized), "utf8")
    .digest("hex");
}

export function digestActionPayload(
  payload: Record<string, unknown> | null | undefined,
): { digest: string; snapshot: Record<string, unknown> } {
  const snapshot = actionSnapshotFromPayload(payload);
  return { digest: digestActionSnapshot(snapshot), snapshot };
}

/**
 * Resume bind: intended payload must match every field that was frozen at approve time.
 * Extra fields on resume are ignored so SDK policyPayload can be a subset of the gate event.
 */
export function approvedActionMatches(
  approvedSnapshot: Record<string, unknown>,
  intendedPayload: Record<string, unknown> | null | undefined,
): { match: boolean; intendedSnapshot: Record<string, unknown> } {
  const intendedFull = actionSnapshotFromPayload(intendedPayload);
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(approvedSnapshot)) {
    if (key in intendedFull) {
      projected[key] = intendedFull[key];
    }
  }
  const match =
    digestActionSnapshot(approvedSnapshot) === digestActionSnapshot(projected) &&
    Object.keys(approvedSnapshot).every((key) => key in intendedFull);
  return { match, intendedSnapshot: intendedFull };
}
