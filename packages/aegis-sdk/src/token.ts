/**
 * AEGIS-TOKEN1 decision tokens.
 *
 * Aegis signs these when a case is allowed or approved after a hold. An executor
 * presents the token with the actual parameters it is about to run; Aegis (or
 * checkToken offline) confirms the hash matches before money moves.
 *
 * Signature input:
 *   SHA-256("AEGIS-TOKEN1\n" + key_id + "\n" + JCS(token without signature))
 * Signature encoding: Ed25519 over that digest, base64url (no padding).
 */
import { randomBytes, randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import { base64urlDecode, base64urlEncode, toKeyBytes } from "./encoding.js";
import { assertEventJson, isPlainObject, jcs, sha256Bytes, sha256Hex } from "./jcs.js";
import type { JsonValue, KeyInput } from "./types.js";

export const TOKEN_VERSION = 1 as const;
/** Domain-separation prefix for AEGIS-TOKEN1 signature input. */
export const TOKEN_SIGNATURE_DOMAIN = "AEGIS-TOKEN1\n";

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const HEX256_RE = /^[0-9a-f]{64}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export type ExecutableParams = { [key: string]: JsonValue };

export type UnsignedDecisionToken = {
  v: typeof TOKEN_VERSION;
  token_id: string;
  tenant: string;
  case_id: string;
  decision_id: string;
  action_type: string;
  /** sha256 hex of JCS(executable params) */
  params_hash: string;
  issued_at: string;
  expires_at: string;
  nonce: string;
  key_id: string;
};

export type DecisionToken = UnsignedDecisionToken & {
  /** base64url (no padding) Ed25519 signature */
  signature: string;
};

export type BuildDecisionTokenInput = {
  tenant: string;
  case_id: string;
  decision_id: string;
  action_type: string;
  /** Already-picked executable params (only the bound fields). */
  params: ExecutableParams;
  key_id: string;
  issued_at?: Date | string;
  /** Absolute expiry, or omit and pass ttl_sec. */
  expires_at?: Date | string;
  /** Seconds from issued_at; default 3600. Ignored when expires_at is set. */
  ttl_sec?: number;
  token_id?: string;
  nonce?: string;
};

export type TokenVerifyFailureReason =
  | "malformed"
  | "unsupported_version"
  | "bad_signature"
  | "expired"
  | "params_hash_mismatch";

export type TokenVerifyResult =
  | { ok: true }
  | { ok: false; reason: TokenVerifyFailureReason; detail?: string };

export type CheckTokenResult =
  | {
      ok: true;
      params_hash: string;
    }
  | {
      ok: false;
      reason: TokenVerifyFailureReason | "field_mismatch";
      detail?: string;
      /** Named fields that differ (authorised vs actual). */
      mismatched_fields?: Array<{
        field: string;
        authorised: JsonValue | undefined;
        actual: JsonValue | undefined;
      }>;
    };

export type OnAegisUnavailable = "allow_and_flag" | "block";

export type UnavailablePolicyResult =
  | { proceed: false; flag: false; policy: "block" }
  | { proceed: true; flag: true; policy: "allow_and_flag" };

/** sha256 hex of JCS(params). Params must be in the AEGIS-SRC1 value domain. */
export function paramsHash(params: ExecutableParams): string {
  assertEventJson(params, "params");
  return sha256Hex(jcs(params));
}

/** Pick only the named executable fields from a larger attribute bag. Missing keys are omitted. */
export function pickExecutableParams(
  attributes: Record<string, unknown>,
  fields: readonly string[],
): ExecutableParams {
  const out: ExecutableParams = {};
  for (const field of fields) {
    if (!(field in attributes)) continue;
    const value = attributes[field];
    if (value === undefined) continue;
    assertEventJson(value as JsonValue, `params.${field}`);
    out[field] = value as JsonValue;
  }
  return out;
}

/** Compare authorised vs actual params; return every differing field. */
export function diffExecutableParams(
  authorised: ExecutableParams,
  actual: ExecutableParams,
): Array<{ field: string; authorised: JsonValue | undefined; actual: JsonValue | undefined }> {
  const fields = new Set([...Object.keys(authorised), ...Object.keys(actual)]);
  const mismatches: Array<{
    field: string;
    authorised: JsonValue | undefined;
    actual: JsonValue | undefined;
  }> = [];
  for (const field of [...fields].sort()) {
    const a = authorised[field];
    const b = actual[field];
    if (jcs(a ?? null) !== jcs(b ?? null)) {
      mismatches.push({ field, authorised: a, actual: b });
    }
  }
  return mismatches;
}

function formatTs(value: Date | string | undefined, fallback: Date): string {
  const date =
    value === undefined
      ? fallback
      : typeof value === "string"
        ? new Date(value)
        : value;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid timestamp");
  }
  return date.toISOString();
}

function newTokenId(): string {
  return `dtk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function newNonce(): string {
  return base64urlEncode(new Uint8Array(randomBytes(16)));
}

export function buildDecisionToken(input: BuildDecisionTokenInput): UnsignedDecisionToken {
  if (!ID_RE.test(input.tenant)) throw new TypeError("invalid tenant");
  if (!ID_RE.test(input.case_id)) throw new TypeError("invalid case_id");
  if (!ID_RE.test(input.decision_id)) throw new TypeError("invalid decision_id");
  if (!ID_RE.test(input.action_type)) throw new TypeError("invalid action_type");
  if (!ID_RE.test(input.key_id)) throw new TypeError("invalid key_id");

  const issued = formatTs(input.issued_at, new Date());
  const issuedMs = new Date(issued).getTime();
  const expires =
    input.expires_at !== undefined
      ? formatTs(input.expires_at, new Date())
      : new Date(issuedMs + (input.ttl_sec ?? 3600) * 1000).toISOString();

  return {
    v: TOKEN_VERSION,
    token_id: input.token_id ?? newTokenId(),
    tenant: input.tenant,
    case_id: input.case_id,
    decision_id: input.decision_id,
    action_type: input.action_type,
    params_hash: paramsHash(input.params),
    issued_at: issued,
    expires_at: expires,
    nonce: input.nonce ?? newNonce(),
    key_id: input.key_id,
  };
}

/** Signing text bytes before SHA-256: AEGIS-TOKEN1\n + key_id + \n + JCS(unsigned). */
export function tokenSignatureInput(token: UnsignedDecisionToken | DecisionToken): string {
  const { signature: _sig, ...rest } = token as DecisionToken;
  void _sig;
  return `${TOKEN_SIGNATURE_DOMAIN}${token.key_id}\n${jcs(rest)}`;
}

export function tokenSignatureInputHex(token: UnsignedDecisionToken | DecisionToken): string {
  return sha256Hex(tokenSignatureInput(token));
}

export async function signDecisionToken(
  token: UnsignedDecisionToken,
  privateKey: KeyInput,
): Promise<DecisionToken> {
  const seed = toKeyBytes(privateKey, "privateKey");
  const digest = sha256Bytes(tokenSignatureInput(token));
  const signature = await ed.signAsync(digest, seed);
  return { ...token, signature: base64urlEncode(signature) };
}

function shapeError(token: unknown): string | null {
  if (!isPlainObject(token)) return "token must be an object";
  const allowed = new Set([
    "v",
    "token_id",
    "tenant",
    "case_id",
    "decision_id",
    "action_type",
    "params_hash",
    "issued_at",
    "expires_at",
    "nonce",
    "key_id",
    "signature",
  ]);
  for (const key of Object.keys(token)) {
    if (!allowed.has(key)) return `unknown field: ${key}`;
  }
  for (const key of allowed) {
    if (!(key in token)) return `missing field: ${key}`;
  }
  const t = token as Record<string, unknown>;
  if (t.v !== 1) return "unsupported version";
  for (const key of ["token_id", "tenant", "case_id", "decision_id", "action_type", "key_id", "nonce", "signature"]) {
    if (typeof t[key] !== "string" || (t[key] as string).length === 0) {
      return `invalid ${key}`;
    }
  }
  if (typeof t.params_hash !== "string" || !HEX256_RE.test(t.params_hash)) {
    return "invalid params_hash";
  }
  if (typeof t.issued_at !== "string" || !TS_RE.test(t.issued_at)) {
    return "invalid issued_at";
  }
  if (typeof t.expires_at !== "string" || !TS_RE.test(t.expires_at)) {
    return "invalid expires_at";
  }
  if (!ID_RE.test(t.tenant as string) || !ID_RE.test(t.key_id as string)) {
    return "invalid id field";
  }
  return null;
}

export async function verifyDecisionToken(
  token: unknown,
  publicKey: KeyInput,
  options?: { now?: Date },
): Promise<TokenVerifyResult> {
  const shape = shapeError(token);
  if (shape === "unsupported version") {
    return { ok: false, reason: "unsupported_version", detail: shape };
  }
  if (shape) {
    return { ok: false, reason: "malformed", detail: shape };
  }
  const t = token as DecisionToken;
  const now = options?.now ?? new Date();
  if (new Date(t.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired", detail: `expired at ${t.expires_at}` };
  }
  try {
    const pub = toKeyBytes(publicKey, "publicKey");
    const sig = base64urlDecode(t.signature);
    if (!sig || sig.length !== 64) {
      return { ok: false, reason: "bad_signature", detail: "signature must be 64 bytes base64url" };
    }
    const digest = sha256Bytes(tokenSignatureInput(t));
    const ok = await ed.verifyAsync(sig, digest, pub);
    if (!ok) return { ok: false, reason: "bad_signature" };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "bad_signature",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Offline check for an executor that cannot call Aegis right now.
 * Verifies signature, expiry and params hash. Single-use enforcement still
 * requires the online confirm; reconciliation catches offline use.
 */
export async function checkToken(
  token: unknown,
  actualParams: ExecutableParams,
  publicKey: KeyInput,
  options?: {
    now?: Date;
    /** When set, name the fields that differ instead of only reporting hash mismatch. */
    authorisedParams?: ExecutableParams;
  },
): Promise<CheckTokenResult> {
  const verified = await verifyDecisionToken(token, publicKey, { now: options?.now });
  if (!verified.ok) {
    return verified;
  }
  const t = token as DecisionToken;
  let actualHash: string;
  try {
    actualHash = paramsHash(actualParams);
  } catch (err) {
    return {
      ok: false,
      reason: "malformed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (actualHash === t.params_hash) {
    return { ok: true, params_hash: actualHash };
  }
  const authorised = options?.authorisedParams;
  if (authorised) {
    const mismatched = diffExecutableParams(authorised, actualParams);
    if (mismatched.length > 0) {
      return {
        ok: false,
        reason: "field_mismatch",
        detail: `params differ: ${mismatched.map((m) => m.field).join(", ")}`,
        mismatched_fields: mismatched,
      };
    }
  }
  return {
    ok: false,
    reason: "params_hash_mismatch",
    detail: `expected ${t.params_hash}, got ${actualHash}`,
  };
}

/** What the executor should do when Aegis cannot be reached for confirm. */
export function resolveOnAegisUnavailable(
  policy: OnAegisUnavailable | string | null | undefined,
): UnavailablePolicyResult {
  if (policy === "block") {
    return { proceed: false, flag: false, policy: "block" };
  }
  // Default (and explicit allow_and_flag): proceed, then flag for reconciliation.
  return { proceed: true, flag: true, policy: "allow_and_flag" };
}
