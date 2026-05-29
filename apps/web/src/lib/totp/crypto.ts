import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decodeKeyMaterial(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const asBase64 = Buffer.from(trimmed, "base64");
    if (asBase64.length >= 32) {
      return asBase64.subarray(0, 32);
    }
  } catch {
    // Fall through to utf8 hash derivation.
  }
  const asUtf8 = Buffer.from(trimmed, "utf8");
  return asUtf8.length ? asUtf8 : null;
}

function resolveTotpKey(): Buffer {
  const explicit = process.env.TOTP_ENCRYPTION_KEY;
  if (explicit) {
    const decoded = decodeKeyMaterial(explicit);
    if (decoded) return createHash("sha256").update(decoded).digest();
  }
  const fallback = process.env.AUTH_SECRET;
  if (!fallback) {
    throw new Error("AUTH_SECRET or TOTP_ENCRYPTION_KEY is required for TOTP encryption");
  }
  return createHash("sha256").update(fallback, "utf8").digest();
}

export function encryptTotpSecret(secret: string): string {
  const key = resolveTotpKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptTotpSecret(payload: string): string {
  const key = resolveTotpKey();
  const raw = Buffer.from(payload, "base64url");
  if (raw.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted TOTP payload");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
