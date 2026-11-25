import { createHash } from "node:crypto";
import type { ApsEvent } from "./types.js";

/** Stable JSON serialization (sorted object keys). */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Digest of an arbitrary body (legacy helper name kept for callers). */
export function eventHashFromBody(body: Record<string, unknown>): string {
  return `sha256:${sha256Hex(canonicalize(body))}`;
}

/** Content digest of a sealed APS-1 event (used for merkle / verify). */
export function eventDigest(event: ApsEvent): string {
  return eventHashFromBody(event as unknown as Record<string, unknown>);
}
