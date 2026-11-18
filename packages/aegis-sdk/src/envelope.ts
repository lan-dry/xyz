import { randomBytes, randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import { base64urlDecode, base64urlEncode, decodeKeyString, toKeyBytes } from "./encoding.js";
import { assertEventJson, isPlainObject, jcs, sha256Bytes, sha256Hex } from "./jcs.js";
import type {
  BuildEnvelopeInput,
  BusinessEvent,
  KeyInput,
  SignedEnvelope,
  UnsignedEnvelope,
  VerifyResult,
} from "./types.js";

export const ENVELOPE_VERSION = "1" as const;
/** Domain-separation prefix for AEGIS-SRC1 signature input. */
export const SIGNATURE_DOMAIN = "AEGIS-SRC1\n";

const ENVELOPE_FIELDS = [
  "aegis_envelope",
  "source_id",
  "key_id",
  "seq",
  "ts",
  "nonce",
  "idempotency_key",
  "event",
  "event_hash",
] as const;

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX256_RE = /^[0-9a-f]{64}$/;

/** sha256 hex of JCS(event). */
export function eventHash(event: BusinessEvent): string {
  assertEventJson(event);
  return sha256Hex(jcs(event));
}

export function newNonce(): string {
  return base64urlEncode(new Uint8Array(randomBytes(16)));
}

export function formatTimestamp(ts: Date | string): string {
  const date = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid timestamp");
  }
  const out = date.toISOString();
  if (typeof ts === "string" && out !== ts) {
    throw new TypeError("ts string must be ISO-8601 UTC with millisecond precision");
  }
  return out;
}

/** Returns an error message if the (unsigned) envelope shape is invalid, else null. */
function shapeError(envelope: unknown, allowSignature: boolean): string | null {
  if (!isPlainObject(envelope)) {
    return "envelope must be an object";
  }
  const allowed = new Set<string>(ENVELOPE_FIELDS);
  if (allowSignature) {
    allowed.add("signature");
  }
  for (const key of Object.keys(envelope)) {
    if (!allowed.has(key)) {
      return `unknown field: ${key}`;
    }
  }
  for (const key of ENVELOPE_FIELDS) {
    if (!(key in envelope)) {
      return `missing field: ${key}`;
    }
  }
  const e = envelope as Record<string, unknown>;
  if (typeof e.source_id !== "string" || !ID_RE.test(e.source_id)) {
    return "invalid source_id";
  }
  if (typeof e.key_id !== "string" || !ID_RE.test(e.key_id)) {
    return "invalid key_id";
  }
  if (typeof e.seq !== "number" || !Number.isSafeInteger(e.seq) || e.seq < 1) {
    return "seq must be a positive safe integer";
  }
  if (typeof e.ts !== "string" || !TS_RE.test(e.ts) || Number.isNaN(Date.parse(e.ts)) ||
    new Date(e.ts).toISOString() !== e.ts) {
    return "ts must be ISO-8601 UTC with millisecond precision";
  }
  if (typeof e.nonce !== "string" || base64urlDecode(e.nonce)?.length !== 16) {
    return "nonce must be base64url of 16 bytes";
  }
  if (typeof e.idempotency_key !== "string" || !UUID_RE.test(e.idempotency_key)) {
    return "idempotency_key must be a UUID";
  }
  if (typeof e.event_hash !== "string" || !HEX256_RE.test(e.event_hash)) {
    return "event_hash must be 64 lowercase hex chars";
  }
  if (!isPlainObject(e.event)) {
    return "event must be an object";
  }
  try {
    assertEventJson(e.event);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return null;
}

function stripSignature(envelope: UnsignedEnvelope | SignedEnvelope): UnsignedEnvelope {
  const copy: Record<string, unknown> = { ...envelope };
  delete copy.signature;
  return copy as unknown as UnsignedEnvelope;
}

/** SHA-256( "AEGIS-SRC1\n" + source_id + "\n" + key_id + "\n" + JCS(envelope without signature) ) */
export function signatureInput(envelope: UnsignedEnvelope | SignedEnvelope): Uint8Array {
  const unsigned = stripSignature(envelope);
  const text =
    SIGNATURE_DOMAIN + unsigned.source_id + "\n" + unsigned.key_id + "\n" + jcs(unsigned);
  return sha256Bytes(text);
}

export function signatureInputHex(envelope: UnsignedEnvelope | SignedEnvelope): string {
  return Buffer.from(signatureInput(envelope)).toString("hex");
}

/** Build an unsigned envelope: fills nonce, idempotency key, ts and event_hash. */
export function buildEnvelope(input: BuildEnvelopeInput): UnsignedEnvelope {
  const envelope: UnsignedEnvelope = {
    aegis_envelope: ENVELOPE_VERSION,
    source_id: input.source_id,
    key_id: input.key_id,
    seq: input.seq,
    ts: formatTimestamp(input.ts ?? new Date()),
    nonce: input.nonce ?? newNonce(),
    idempotency_key: input.idempotency_key ?? randomUUID(),
    event: input.event,
    event_hash: eventHash(input.event),
  };
  const err = shapeError(envelope, false);
  if (err) {
    throw new TypeError(`Invalid envelope: ${err}`);
  }
  return envelope;
}

/** Sign an envelope (any existing signature is replaced). Throws if event_hash is wrong. */
export async function signEnvelope(
  envelope: UnsignedEnvelope | SignedEnvelope,
  privateKey: KeyInput,
): Promise<SignedEnvelope> {
  const unsigned = stripSignature(envelope);
  const err = shapeError(unsigned, false);
  if (err) {
    throw new TypeError(`Invalid envelope: ${err}`);
  }
  if (eventHash(unsigned.event) !== unsigned.event_hash) {
    throw new Error("event_hash does not match JCS(event)");
  }
  const seed = toKeyBytes(privateKey, "private key");
  const signature = await ed.signAsync(signatureInput(unsigned), seed);
  return { ...unsigned, signature: base64urlEncode(new Uint8Array(signature)) };
}

/** Verify event_hash and the Ed25519 signature of an AEGIS-SRC1 envelope. Never throws. */
export async function verifyEnvelope(
  envelope: unknown,
  publicKey: KeyInput,
): Promise<VerifyResult> {
  if (isPlainObject(envelope) && "aegis_envelope" in envelope && envelope.aegis_envelope !== ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }
  const shape = shapeError(envelope, true);
  if (shape) {
    return { ok: false, reason: "malformed", detail: shape };
  }
  const signed = envelope as SignedEnvelope;
  if (typeof signed.signature !== "string") {
    return { ok: false, reason: "malformed", detail: "missing field: signature" };
  }
  const signature = base64urlDecode(signed.signature);
  if (!signature || signature.length !== 64) {
    return { ok: false, reason: "malformed", detail: "signature must be base64url of 64 bytes" };
  }
  if (eventHash(signed.event) !== signed.event_hash) {
    return { ok: false, reason: "event_hash_mismatch" };
  }
  const keyBytes = typeof publicKey === "string" ? decodeKeyString(publicKey) : publicKey;
  if (!keyBytes || keyBytes.length !== 32) {
    return { ok: false, reason: "malformed", detail: "public key must be 32 bytes" };
  }
  let valid = false;
  try {
    valid = await ed.verifyAsync(signature, signatureInput(signed), keyBytes, { zip215: false });
  } catch {
    valid = false;
  }
  return valid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
