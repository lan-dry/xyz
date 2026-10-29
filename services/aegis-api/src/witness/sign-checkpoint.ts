import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";

/**
 * Signs Merkle checkpoint root hashes so DB admins cannot silently rewrite
 * witness-roots without invalidating the signature.
 *
 * Env (first match wins):
 * - WITNESS_CHECKPOINT_PRIVATE_KEY_B64
 * - AEGIS_WITNESS_CHECKPOINT_KEY_B64
 * - DEV_SIGNING_PRIVATE_KEY_B64 (local only)
 *
 * Optional: WITNESS_CHECKPOINT_KEY_ID (default witness_checkpoint_v1)
 */
export function resolveWitnessCheckpointPrivateKeyB64(): string | null {
  return (
    process.env.WITNESS_CHECKPOINT_PRIVATE_KEY_B64?.trim() ||
    process.env.AEGIS_WITNESS_CHECKPOINT_KEY_B64?.trim() ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() ||
    null
  );
}

export function witnessCheckpointKeyId(): string {
  return process.env.WITNESS_CHECKPOINT_KEY_ID?.trim() || "witness_checkpoint_v1";
}

/** Public key for the configured witness checkpoint private key (Ed25519). */
export async function witnessCheckpointPublicKeyB64(): Promise<string | null> {
  const keyB64 = resolveWitnessCheckpointPrivateKeyB64();
  if (!keyB64) return null;
  const privateKey = Buffer.from(keyB64, "base64");
  if (privateKey.length !== 32) return null;
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return Buffer.from(publicKey).toString("base64");
}

/** Canonical message: SHA-256 of the root_hash hex string (UTF-8). */
export function checkpointSigningMessage(rootHashHex: string): Uint8Array {
  return createHash("sha256").update(rootHashHex.trim().toLowerCase(), "utf8").digest();
}

export async function signWitnessCheckpoint(
  rootHashHex: string,
): Promise<{ sig_value_b64: string; sig_key_id: string } | null> {
  const keyB64 = resolveWitnessCheckpointPrivateKeyB64();
  if (!keyB64) return null;
  const privateKey = Buffer.from(keyB64, "base64");
  if (privateKey.length !== 32) {
    console.warn(
      "[witness] checkpoint key must be 32-byte Ed25519 seed (base64); skipping sign",
    );
    return null;
  }
  const sig = await ed.signAsync(checkpointSigningMessage(rootHashHex), privateKey);
  return {
    sig_value_b64: Buffer.from(sig).toString("base64"),
    sig_key_id: witnessCheckpointKeyId(),
  };
}

export async function verifyWitnessCheckpoint(input: {
  root_hash: string;
  sig_value_b64: string;
  public_key_b64: string;
}): Promise<boolean> {
  try {
    const pub = Buffer.from(input.public_key_b64, "base64");
    const sig = Buffer.from(input.sig_value_b64, "base64");
    return await ed.verifyAsync(
      sig,
      checkpointSigningMessage(input.root_hash),
      pub,
    );
  } catch {
    return false;
  }
}
