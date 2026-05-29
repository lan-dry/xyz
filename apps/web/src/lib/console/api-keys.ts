import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { API_KEY_PREFIX } from "./constants";

const BCRYPT_ROUNDS = 12;

export function generateApiKeyMaterial(): { prefix: string; secret: string; fullKey: string } {
  const suffix = randomBytes(24).toString("base64url");
  const secret = `${API_KEY_PREFIX}${suffix}`;
  return {
    prefix: API_KEY_PREFIX,
    secret,
    fullKey: secret,
  };
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS);
}

export async function verifyApiKeySecret(secret: string, secretHash: string): Promise<boolean> {
  return bcrypt.compare(secret, secretHash);
}

/** Fingerprint for logs — never log raw secret. */
export function apiKeyFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

/** Ensures DB row never contains raw secret (test helper). */
export function assertNoRawSecretInStorage(secret: string, stored: { secretHash: string; prefix: string }): void {
  if (stored.secretHash === secret) {
    throw new Error("Raw API key must not be stored in secret_hash");
  }
  if (stored.secretHash.includes(secret)) {
    throw new Error("Raw API key must not appear in secret_hash");
  }
}
