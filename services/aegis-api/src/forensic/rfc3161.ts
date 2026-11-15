/**
 * Optional RFC 3161 timestamping for signed checkpoints (P2).
 * Configurable per tenant; verifier reports absence plainly.
 * Local test authority used in unit tests — not a production TSA.
 */

import { createHash, createHmac } from "node:crypto";

export type TimestampToken = {
  alg: "local-test-tsa";
  issued_at: string;
  message_hash: string;
  token_b64: string;
};

/** Local test TSA — HMAC over hash+time with a test secret. Not for production trust. */
export function createLocalTestTimestamp(
  messageHash: string,
  secret = "aegis-local-test-tsa",
  issuedAt = new Date().toISOString(),
): TimestampToken {
  const material = `${messageHash}|${issuedAt}`;
  const mac = createHmac("sha256", secret).update(material, "utf8").digest("base64");
  return {
    alg: "local-test-tsa",
    issued_at: issuedAt,
    message_hash: messageHash,
    token_b64: mac,
  };
}

export function verifyLocalTestTimestamp(
  token: TimestampToken,
  expectedMessageHash: string,
  secret = "aegis-local-test-tsa",
): { ok: boolean; reason?: string } {
  if (token.alg !== "local-test-tsa") {
    return { ok: false, reason: "unsupported_tsa_alg" };
  }
  if (token.message_hash !== expectedMessageHash) {
    return { ok: false, reason: "message_hash_mismatch" };
  }
  const expected = createLocalTestTimestamp(
    expectedMessageHash,
    secret,
    token.issued_at,
  );
  if (expected.token_b64 !== token.token_b64) {
    return { ok: false, reason: "token_invalid" };
  }
  return { ok: true };
}

export function hashForTimestamp(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export type CheckpointTimestampReport = {
  present: boolean;
  ok: boolean | null;
  message: string;
};

export function reportCheckpointTimestamp(
  token: TimestampToken | null | undefined,
  headHash: string,
): CheckpointTimestampReport {
  if (!token) {
    return {
      present: false,
      ok: null,
      message: "No RFC 3161 timestamp token present on checkpoint",
    };
  }
  const result = verifyLocalTestTimestamp(token, headHash);
  return {
    present: true,
    ok: result.ok,
    message: result.ok
      ? "Timestamp token verified (local test TSA)"
      : `Timestamp token failed: ${result.reason}`,
  };
}
