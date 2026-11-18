import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

/** RFC 8785 JSON Canonicalization Scheme. Returns the canonical JSON text. */
export function jcs(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) {
    throw new TypeError("Value is not canonicalizable");
  }
  return out;
}

export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hash = createHash("sha256");
  if (typeof input === "string") {
    hash.update(input, "utf8");
  } else {
    hash.update(input);
  }
  return new Uint8Array(hash.digest());
}

export function sha256Hex(input: string | Uint8Array): string {
  return Buffer.from(sha256Bytes(input)).toString("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertWellFormed(text: string, path: string): void {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      throw new TypeError(`${path}: string contains a lone surrogate`);
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      throw new TypeError(`${path}: string contains a lone surrogate`);
    }
  }
}

/**
 * Enforce the AEGIS-SRC1 event value domain: null, boolean, string, safe
 * integer, arrays and plain objects. Floats are rejected (money is always a
 * decimal string), as are undefined, bigint, NaN/Infinity and class instances.
 */
export function assertEventJson(value: unknown, path = "event"): void {
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "string") {
    assertWellFormed(value, path);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `${path}: numbers must be safe integers (use a decimal string for money/fractions), got ${String(value)}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertEventJson(item, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertWellFormed(key, `${path} key`);
      assertEventJson(item, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`${path}: unsupported value type ${typeof value}`);
}

export { isPlainObject };
