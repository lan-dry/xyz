export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Business event carried inside an AEGIS-SRC1 envelope.
 * Money MUST be a decimal string (e.g. "1234.50"), never a float. Numbers that
 * appear in events must be safe integers.
 */
export type BusinessEvent = { [key: string]: JsonValue };

export type EnvelopeVersion = "1";

export interface UnsignedEnvelope {
  aegis_envelope: EnvelopeVersion;
  source_id: string;
  key_id: string;
  seq: number;
  /** ISO-8601 UTC with millisecond precision, e.g. 2026-11-18T10:01:22.123Z */
  ts: string;
  /** base64url (no padding) of 16 random bytes */
  nonce: string;
  /** UUID */
  idempotency_key: string;
  event: BusinessEvent;
  /** sha256 hex of JCS(event) */
  event_hash: string;
}

export interface SignedEnvelope extends UnsignedEnvelope {
  /** base64url (no padding) Ed25519 signature */
  signature: string;
}

/** Key material: raw bytes, or a base64 / base64url string. */
export type KeyInput = Uint8Array | string;

export interface KeyPair {
  /** 32-byte Ed25519 seed */
  privateKey: Uint8Array;
  /** 32-byte Ed25519 public key */
  publicKey: Uint8Array;
  privateKeyB64: string;
  publicKeyB64: string;
}

export type VerifyFailureReason =
  | "malformed"
  | "unsupported_version"
  | "event_hash_mismatch"
  | "bad_signature";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: VerifyFailureReason; detail?: string };

export interface BuildEnvelopeInput {
  source_id: string;
  key_id: string;
  seq: number;
  event: BusinessEvent;
  /** Defaults to now. Date or ISO string with ms precision. */
  ts?: Date | string;
  /** Defaults to 16 random bytes, base64url. */
  nonce?: string;
  /** Defaults to a random UUID. Reuse the same key when retrying delivery. */
  idempotency_key?: string;
}
