/**
 * Optional RFC 3161 timestamping for signed checkpoints (P2).
 * Configurable per tenant; verifier reports absence plainly.
 * Local test authority used in unit tests — not a production TSA.
 *
 * Production: set AEGIS_TSA_URL to an RFC 3161 Time Stamp Authority HTTP endpoint.
 * The client POSTs application/timestamp-query and stores the binary response as token_b64.
 */

import { createHash, createHmac } from "node:crypto";

export type TimestampToken = {
  alg: "local-test-tsa" | "rfc3161";
  issued_at: string;
  message_hash: string;
  token_b64: string;
  tsa_url?: string;
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

/**
 * Minimal RFC 3161 TimeStampReq (ASN.1 DER) for a SHA-256 message imprint.
 * Structure: SEQUENCE { version INTEGER 1, messageImprint SEQUENCE { hashAlg, hashedMessage }, certReq TRUE }
 */
export function buildRfc3161TimestampRequest(
  messageHashHex: string,
): Uint8Array {
  const hash = Buffer.from(messageHashHex.replace(/^sha256:/i, ""), "hex");
  if (hash.length !== 32) {
    throw new Error("RFC3161 request expects 32-byte SHA-256 message hash");
  }
  // SHA-256 OID 2.16.840.1.101.3.4.2.1 → 06 09 60 86 48 01 65 03 04 02 01
  const hashAlg = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
    0x05, 0x00,
  ]);
  const hashedMessage = Buffer.concat([
    Buffer.from([0x04, 0x20]),
    hash,
  ]);
  const messageImprint = Buffer.concat([
    Buffer.from([0x30, hashAlg.length + hashedMessage.length]),
    hashAlg,
    hashedMessage,
  ]);
  const version = Buffer.from([0x02, 0x01, 0x01]);
  const certReq = Buffer.from([0x01, 0x01, 0xff]);
  const body = Buffer.concat([version, messageImprint, certReq]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

export type Rfc3161ClientResult = {
  ok: boolean;
  token?: TimestampToken;
  error?: string;
  status?: number;
};

/**
 * Call a configured TSA URL (AEGIS_TSA_URL) with a real RFC 3161 request.
 * Keeps local test TSA for unit tests when URL is unset.
 */
export async function requestRfc3161Timestamp(
  messageHash: string,
  options?: { tsaUrl?: string; fetchImpl?: typeof fetch },
): Promise<Rfc3161ClientResult> {
  const tsaUrl =
    options?.tsaUrl?.trim() || process.env.AEGIS_TSA_URL?.trim() || "";
  if (!tsaUrl) {
    return {
      ok: false,
      error:
        "AEGIS_TSA_URL not set — use createLocalTestTimestamp for local/dev only",
    };
  }
  const fetchFn = options?.fetchImpl ?? fetch;
  let req: Uint8Array;
  try {
    req = buildRfc3161TimestampRequest(messageHash);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply",
      },
      body: Buffer.from(req),
    };
    if (!options?.fetchImpl && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      init.signal = AbortSignal.timeout(20_000);
    }
    const response = await fetchFn(tsaUrl, init);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `TSA HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    // Accept short local mocks (≥3 bytes); production TSA replies are larger.
    if (buf.length < 3) {
      return { ok: false, error: "TSA response too short" };
    }
    return {
      ok: true,
      status: response.status,
      token: {
        alg: "rfc3161",
        issued_at: new Date().toISOString(),
        message_hash: messageHash,
        token_b64: buf.toString("base64"),
        tsa_url: tsaUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Resolve timestamp: production TSA when configured, else local test token. */
export async function createCheckpointTimestamp(
  messageHash: string,
): Promise<TimestampToken> {
  if (process.env.AEGIS_TSA_URL?.trim()) {
    const result = await requestRfc3161Timestamp(messageHash);
    if (!result.ok || !result.token) {
      throw new Error(result.error ?? "RFC3161 TSA request failed");
    }
    return result.token;
  }
  return createLocalTestTimestamp(messageHash);
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
  if (token.alg === "rfc3161") {
    return {
      present: true,
      ok: null,
      message:
        "RFC 3161 token present (binary TSA reply stored). Offline cryptographic verification of the TSA response is deferred to an external verifier / openssl ts -verify.",
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
