const B64URL_RE = /^[A-Za-z0-9_-]*$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Strict, canonical, unpadded base64url decode. Returns null if malformed. */
export function base64urlDecode(text: string): Uint8Array | null {
  if (!B64URL_RE.test(text)) {
    return null;
  }
  const bytes = new Uint8Array(Buffer.from(text, "base64url"));
  if (base64urlEncode(bytes) !== text) {
    return null;
  }
  return bytes;
}

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Accepts standard base64 (padded) or base64url. Returns null if malformed. */
export function decodeKeyString(text: string): Uint8Array | null {
  if (B64URL_RE.test(text)) {
    return base64urlDecode(text);
  }
  if (!B64_RE.test(text)) {
    return null;
  }
  const bytes = new Uint8Array(Buffer.from(text, "base64"));
  return base64Encode(bytes) === text ? bytes : null;
}

export function toKeyBytes(key: Uint8Array | string, what: string): Uint8Array {
  const bytes = typeof key === "string" ? decodeKeyString(key) : key;
  if (!bytes || bytes.length !== 32) {
    throw new TypeError(`${what} must be 32 bytes (raw, base64 or base64url)`);
  }
  return bytes;
}
