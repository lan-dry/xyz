import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import canonicalize from "canonicalize";
import type { ApsEvent } from "./types.js";

const SIG_FIELDS = ["sig_alg", "sig_value_b64"] as const;

export function stripSignatureFields(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const signing: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!SIG_FIELDS.includes(key as (typeof SIG_FIELDS)[number])) {
      signing[key] = value;
    }
  }
  return signing;
}

/** SHA-256 digest per APS-1 §3.2 (JCS of signing object + domain prefix). */
export function signingDigest(
  event: Record<string, unknown>,
  keyId: string,
): Uint8Array {
  const signing = stripSignatureFields(event);
  const jcs = canonicalize(signing);
  if (jcs === undefined) {
    throw new Error("Event is not canonicalizable");
  }
  const prefixed = `APS1\n${keyId}\n${jcs}`;
  return createHash("sha256").update(prefixed, "utf8").digest();
}

export function digestHex(event: Record<string, unknown>, keyId: string): string {
  return Buffer.from(signingDigest(event, keyId)).toString("hex");
}

export async function signEvent(
  event: ApsEvent,
  options: { privateKeyB64: string; keyId: string },
): Promise<ApsEvent> {
  const privateKey = Buffer.from(options.privateKeyB64, "base64");
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key must be 32 bytes (base64)");
  }
  const digest = signingDigest(event as Record<string, unknown>, options.keyId);
  const signature = await ed.signAsync(digest, privateKey);
  return {
    ...event,
    sig_alg: "ed25519",
    sig_value_b64: Buffer.from(signature).toString("base64"),
  };
}

export async function verifyEventSignature(
  event: ApsEvent,
  publicKeyB64: string,
): Promise<boolean> {
  if (event.sig_alg !== "ed25519" || !event.sig_value_b64) {
    return false;
  }
  const publicKey = Buffer.from(publicKeyB64, "base64");
  if (publicKey.length !== 32) {
    return false;
  }
  const digest = signingDigest(event as Record<string, unknown>, event.key_id);
  const signature = Buffer.from(event.sig_value_b64, "base64");
  return ed.verifyAsync(signature, digest, publicKey);
}
