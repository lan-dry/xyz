/**
 * Field policy: store | mask | hash | evaluate_only | omit.
 * evaluate_only fields may be used for decision then must not appear in
 * persisted payload, receipts, or logs.
 */

import { createHash } from "node:crypto";

export type FieldPolicyMode = "store" | "mask" | "hash" | "evaluate_only" | "omit";

export type FieldPolicyRule = {
  field_path: string;
  mode: FieldPolicyMode;
  mask_keep_last?: number;
};

export type FieldPolicyResult = {
  /** Attributes safe to persist / show on receipt. */
  stored: Record<string, unknown>;
  /** Full attributes for evaluation only (includes evaluate_only). */
  for_evaluate: Record<string, unknown>;
  /** Paths that were evaluate_only or omit (must not leak). */
  redacted_paths: string[];
};

function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function deletePath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next == null || typeof next !== "object" || Array.isArray(next)) return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function maskValue(value: unknown, keepLast = 4): string {
  const s = value == null ? "" : String(value);
  if (s.length <= keepLast) return "*".repeat(s.length);
  return `${"*".repeat(Math.max(0, s.length - keepLast))}${s.slice(-keepLast)}`;
}

export function hashValue(value: unknown): string {
  const s = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `sha256:${createHash("sha256").update(s, "utf8").digest("hex")}`;
}

/**
 * Apply field policy. evaluate_only values are available in for_evaluate only.
 */
export function applyFieldPolicy(
  attributes: Record<string, unknown>,
  rules: FieldPolicyRule[],
): FieldPolicyResult {
  const for_evaluate = deepClone(attributes);
  const stored = deepClone(attributes);
  const redacted_paths: string[] = [];

  for (const rule of rules) {
    const path = rule.field_path;
    const current = getPath(attributes, path);
    if (current === undefined) continue;

    switch (rule.mode) {
      case "store":
        break;
      case "mask":
        setPath(stored, path, maskValue(current, rule.mask_keep_last ?? 4));
        redacted_paths.push(path);
        break;
      case "hash":
        setPath(stored, path, hashValue(current));
        redacted_paths.push(path);
        break;
      case "omit":
        deletePath(stored, path);
        deletePath(for_evaluate, path);
        redacted_paths.push(path);
        break;
      case "evaluate_only":
        deletePath(stored, path);
        redacted_paths.push(path);
        break;
      default:
        break;
    }
  }

  return { stored, for_evaluate, redacted_paths };
}

/** Scan text for clear values that must not appear after field policy. */
export function findLeakedClearValues(
  haystack: string,
  clearValues: string[],
): string[] {
  const found: string[] = [];
  for (const v of clearValues) {
    if (!v || v.length < 3) continue;
    if (haystack.includes(v)) found.push(v);
  }
  return found;
}
