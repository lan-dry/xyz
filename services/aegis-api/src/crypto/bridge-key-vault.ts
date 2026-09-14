import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function masterKey(): Buffer {
  const raw = process.env.AEGIS_BRIDGE_MASTER_KEY?.trim();
  if (!raw) {
    throw new Error(
      "AEGIS_BRIDGE_MASTER_KEY is not configured (32-byte secret, base64 or hex).",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const fromB64 = Buffer.from(raw, "base64");
  if (fromB64.length === 32) {
    return fromB64;
  }
  // Derive a stable 32-byte key from any passphrase-like secret
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt Ed25519 private key (base64) for storage. Format: v1.<ivB64>.<tagB64>.<cipherB64> */
export function encryptBridgePrivateKey(privateKeyB64: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(privateKeyB64, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptBridgePrivateKey(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported bridge key ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isBridgeMasterKeyConfigured(): boolean {
  return Boolean(process.env.AEGIS_BRIDGE_MASTER_KEY?.trim());
}
