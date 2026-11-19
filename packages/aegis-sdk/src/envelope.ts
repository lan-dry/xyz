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

/**
 * Signing object: envelope without `signature` and with `event` replaced by nothing —
 * only `event_hash` remains. Field policy can mask/omit the stored event body later
 * without breaking the signature.
 */
export function signingPayload(
  envelope: UnsignedEnvelope | SignedEnvelope,
): Record<string, unknown> {
  const unsigned = stripSignature(envelope);
  const { event: _event, ...rest } = unsigned as UnsignedEnvelope & {
    event?: unknown;
  };
  void _event;
  return { ...rest };
}

/** True when `event` looks like a full business body (not a redaction marker). */
export function isFullEventBody(event: unknown): event is BusinessEvent {
  if (!isPlainObject(event)) return false;
  if (event.redacted_by_field_policy === true) return false;
  return true;
}

/**
 * SHA-256( "AEGIS-SRC1\n" + source_id + "\n" + key_id + "\n" + JCS(signingPayload) )
 * Domain prefix is AEGIS-SRC1 only — never APS1 or the receipt local sorter.
 */
export function signatureInput(envelope: UnsignedEnvelope | SignedEnvelope): Uint8Array {
  const payload = signingPayload(envelope);
  const sourceId = String(payload.source_id ?? "");
  const keyId = String(payload.key_id ?? "");
  const text = SIGNATURE_DOMAIN + sourceId + "\n" + keyId + "\n" + jcs(payload);
  return sha256Bytes(text);
}

export function signatureInputHex(envelope: UnsignedEnvelope | SignedEnvelope): string {
  return Buffer.from(signatureInput(envelope)).toString("hex");
}

/** Build an unsigned envelope: fills nonce, idempotency key, ts and event_hash. */
export function buildEnvelope(input: BuildEnvelopeInput): UnsignedEnvelope {
  const idem =
    input.idempotency_key ??
    (typeof input.event.idempotency_key === "string"
      ? input.event.idempotency_key
      : randomUUID());
  const eventIdem = input.event.idempotency_key;
  if (typeof eventIdem === "string" && eventIdem !== idem) {
    throw new TypeError("envelope.idempotency_key must equal event.idempotency_key");
  }
  const event: BusinessEvent = { ...input.event, idempotency_key: idem };
  const envelope: UnsignedEnvelope = {
    aegis_envelope: ENVELOPE_VERSION,
    source_id: input.source_id,
    key_id: input.key_id,
    seq: input.seq,
    ts: formatTimestamp(input.ts ?? new Date()),
    nonce: input.nonce ?? newNonce(),
    idempotency_key: idem,
    event,
    event_hash: eventHash(event),
  };
  const err = shapeError(envelope, false);
  if (err) {
    throw new TypeError(`Invalid envelope: ${err}`);
  }
  return envelope;
}

/**
 * Sign an envelope (any existing signature is replaced).
 * Throws if event_hash is wrong, or if envelope.idempotency_key ≠ event.idempotency_key
 * when the event carries that field.
 */
export async function signEnvelope(
  envelope: UnsignedEnvelope | SignedEnvelope,
  privateKey: KeyInput,
): Promise<SignedEnvelope> {
  const unsigned = stripSignature(envelope);
  const err = shapeError(unsigned, false);
  if (err) {
    throw new TypeError(`Invalid envelope: ${err}`);
  }
  const eventIdem = unsigned.event.idempotency_key;
  if (typeof eventIdem === "string" && eventIdem !== unsigned.idempotency_key) {
    throw new Error("envelope.idempotency_key must equal event.idempotency_key");
  }
  if (eventHash(unsigned.event) !== unsigned.event_hash) {
    throw new Error("event_hash does not match JCS(event)");
  }
  const seed = toKeyBytes(privateKey, "private key");
  const signature = await ed.signAsync(signatureInput(unsigned), seed);
  return { ...unsigned, signature: base64urlEncode(new Uint8Array(signature)) };
}

/**
 * Verify an AEGIS-SRC1 envelope. Never throws.
 *
 * - Signature is always checked over the payload with `event` replaced by `event_hash`.
 * - When a full event body is present, `event_hash` must match JCS(event).
 * - When the body was redacted for field policy, only the signature + event_hash are checked.
 */
export async function verifyEnvelope(
  envelope: unknown,
  publicKey: KeyInput,
  options: { requireFullEventBody?: boolean } = {},
): Promise<VerifyResult> {
  if (isPlainObject(envelope) && "aegis_envelope" in envelope && envelope.aegis_envelope !== ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }
  // Redacted stored envelopes omit a valid business event; allow that shape when not requiring body.
  const allowRedacted =
    isPlainObject(envelope) &&
    isPlainObject((envelope as { event?: unknown }).event) &&
    (envelope as { event: Record<string, unknown> }).event.redacted_by_field_policy === true;
  const shape = allowRedacted && !options.requireFullEventBody
    ? shapeErrorRedacted(envelope)
    : shapeError(envelope, true);
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
  if (isFullEventBody(signed.event)) {
    if (eventHash(signed.event) !== signed.event_hash) {
      return { ok: false, reason: "event_hash_mismatch" };
    }
    const eventIdem = signed.event.idempotency_key;
    if (typeof eventIdem === "string" && eventIdem !== signed.idempotency_key) {
      return {
        ok: false,
        reason: "malformed",
        detail: "envelope.idempotency_key must equal event.idempotency_key",
      };
    }
  } else if (options.requireFullEventBody) {
    return { ok: false, reason: "malformed", detail: "full event body required" };
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

/** Shape check when `event` was replaced by a redaction marker after ingest. */
function shapeErrorRedacted(envelope: unknown): string | null {
  if (!isPlainObject(envelope)) return "envelope must be an object";
  const allowed = new Set<string>([...ENVELOPE_FIELDS, "signature"]);
  for (const key of Object.keys(envelope)) {
    if (!allowed.has(key)) return `unknown field: ${key}`;
  }
  for (const key of ENVELOPE_FIELDS) {
    if (key === "event") continue;
    if (!(key in envelope)) return `missing field: ${key}`;
  }
  const e = envelope as Record<string, unknown>;
  if (typeof e.signature !== "string") return "missing field: signature";
  if (typeof e.event_hash !== "string" || !HEX256_RE.test(e.event_hash)) {
    return "event_hash must be 64 lowercase hex chars";
  }
  if (!isPlainObject(e.event) || e.event.redacted_by_field_policy !== true) {
    return "redacted event marker required";
  }
  return null;
}
