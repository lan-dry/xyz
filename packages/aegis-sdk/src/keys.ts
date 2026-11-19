import * as ed from "@noble/ed25519";
import { base64Encode, toKeyBytes } from "./encoding.js";
import type { KeyInput, KeyPair } from "./types.js";

/** Generate a fresh Ed25519 key pair (32-byte seed + 32-byte public key). */
export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed.utils.randomSecretKey();
  return keyPairFromSeed(privateKey);
}

/** Derive the key pair for a 32-byte seed (raw, base64 or base64url). */
export async function keyPairFromSeed(seed: KeyInput): Promise<KeyPair> {
  const privateKey = new Uint8Array(toKeyBytes(seed, "private key"));
  const publicKey = new Uint8Array(await ed.getPublicKeyAsync(privateKey));
  return {
    privateKey,
    publicKey,
    privateKeyB64: base64Encode(privateKey),
    publicKeyB64: base64Encode(publicKey),
  };
}
