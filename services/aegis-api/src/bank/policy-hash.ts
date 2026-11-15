import { createHash } from "node:crypto";

export type PolicyContentInput = {
  policy_id: string;
  name: string;
  version: number;
  combine: string;
  rules: Array<{
    rule_id: string;
    tool_pattern: string;
    decision: string;
    priority: number;
    conditions?: unknown;
    obligations?: unknown;
  }>;
};

/** Canonical JSON (sorted keys) then SHA-256 hex — sealed into decisions/receipts. */
export function policyContentHash(input: PolicyContentInput): string {
  const canonical = canonicalize(input);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
