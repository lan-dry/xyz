import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

let warnedDevKey = false;

function vaultKey(): Buffer {
  const configured = process.env.STOA_VAULT_ENCRYPTION_KEY?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STOA_VAULT_ENCRYPTION_KEY is required in production");
    }
    if (!warnedDevKey) {
      warnedDevKey = true;
      console.warn(
        "[stoa-api] STOA_VAULT_ENCRYPTION_KEY not set; using an insecure development key for the redaction vault",
      );
    }
  }
  return createHash("sha256")
    .update(configured || "dev-insecure-stoa-vault-key")
    .digest();
}

export function sealVault(vault: Record<string, string>): string | null {
  if (Object.keys(vault).length === 0) {
    return null;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const payload = Buffer.from(JSON.stringify(vault), "utf8");
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openVault(sealed: string | null | undefined): Record<string, string> {
  if (!sealed) {
    return {};
  }
  try {
    const buf = Buffer.from(sealed, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
    const parsed = JSON.parse(json) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
