/**
 * Forensic receipt — derived from sealed APS-1 events (D1).
 * Every receipt cites event_id / event_hash / sequence_num. Not a second chain.
 */

import { createHash, randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import { nowIso } from "../time/clock.js";

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export type SealedEventRef = {
  event_id: string;
  event_hash: string;
  sequence_num: number;
};

export type ForensicReceiptBody = {
  schema_version: 1;
  receipt_id: string;
  organization_id: string;
  seq: number;
  prev_hash: string | null;
  case_id: string;
  decision_id: string;
  /** Business context for plain-language wording (optional; absent on older receipts). */
  product?: string;
  event_type?: string;
  outcome: string;
  mode: "enforce" | "record_only";
  would_have?: string;
  policy?: {
    policy_id: string;
    version: number;
    content_hash: string | null;
  };
  matched_rules: Array<{
    rule_id: string;
    policy_id: string;
    decision: string;
  }>;
  /** Why the outcome was chosen given matched rules (plain examiner wording). */
  decision_basis?: {
    outcome: string;
    decided_by_rule_id: string | null;
    explanation: string;
    matched: Array<{
      rule_id: string;
      policy_id: string;
      decision: string;
      effect: string;
      note?: string;
    }>;
  };
  /** Plain-language summary for humans; not a substitute for verification. */
  plain_summary?: string;
  sealed_events: SealedEventRef[];
  approvals?: Array<Record<string, unknown>>;
  timeline?: Array<Record<string, unknown>>;
  attributes?: Record<string, unknown>;
  flags?: {
    /** Historical only — new receipts never set this (demo clock removed). */
    demo_clock?: boolean;
    decided_without_aegis?: boolean;
    /** True when citing a provisional (non-APS) event or missing agent key. */
    provisional?: boolean;
    /**
     * Where the signing key lives. Part of the signed body so it cannot be
     * stripped after the fact. Absent on dev/test (plain software) receipts.
     * "kms": AWS KMS Ed25519 key (private key never leaves KMS).
     * "software_interim": software key accepted in production as a stop-gap.
     */
    key_custody?: "kms" | "software_interim";
  };
  issued_at: string;
  key_id: string;
};

export type SignedForensicReceipt = ForensicReceiptBody & {
  receipt_hash: string;
  sig_alg: "ed25519";
  sig_value_b64: string;
};

const SIG_FIELDS = new Set(["sig_alg", "sig_value_b64", "receipt_hash"]);

export function stripReceiptSig(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!SIG_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Canonical (key-sorted JSON) text of the facts the receipt hash is computed over.
 * Included in evidence bundles so a reviewer can re-hash it with any SHA-256 tool.
 */
export function canonicalReceiptPayload(body: Record<string, unknown>): string {
  return canonicalize(stripReceiptSig(body));
}

export function receiptSigningDigest(
  body: Record<string, unknown>,
  keyId: string,
): Uint8Array {
  const signing = stripReceiptSig(body);
  const jcs = canonicalize(signing);
  const prefixed = `AEGIS-RECEIPT1\n${keyId}\n${jcs}`;
  return createHash("sha256").update(prefixed, "utf8").digest();
}

export function computeReceiptHash(body: Record<string, unknown>): string {
  const signing = stripReceiptSig(body);
  const jcs = canonicalize(signing);
  return `sha256:${createHash("sha256").update(jcs, "utf8").digest("hex")}`;
}

/** Anything that can produce a pure Ed25519 signature over the receipt digest (software or KMS). */
export type ReceiptDigestSigner = {
  sign(digest: Uint8Array): Promise<Uint8Array>;
};

export async function signForensicReceiptWith(
  body: ForensicReceiptBody,
  signer: ReceiptDigestSigner,
): Promise<SignedForensicReceipt> {
  const receipt_hash = computeReceiptHash(body as unknown as Record<string, unknown>);
  const withHash = { ...body, receipt_hash };
  const digest = receiptSigningDigest(
    withHash as unknown as Record<string, unknown>,
    body.key_id,
  );
  const signature = await signer.sign(digest);
  if (signature.length !== 64) {
    throw new Error("Ed25519 signature must be 64 bytes");
  }
  return {
    ...withHash,
    sig_alg: "ed25519",
    sig_value_b64: Buffer.from(signature).toString("base64"),
  };
}

export async function signForensicReceipt(
  body: ForensicReceiptBody,
  privateKeyB64: string,
): Promise<SignedForensicReceipt> {
  const privateKey = Buffer.from(privateKeyB64, "base64");
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key must be 32 bytes");
  }
  return signForensicReceiptWith(body, {
    sign: (digest) => ed.signAsync(digest, privateKey),
  });
}

export async function verifyForensicReceiptSignature(
  receipt: SignedForensicReceipt,
  publicKeyB64: string,
): Promise<boolean> {
  try {
    if (receipt.sig_alg !== "ed25519" || !receipt.sig_value_b64) return false;
    const expectedHash = computeReceiptHash(
      receipt as unknown as Record<string, unknown>,
    );
    if (expectedHash !== receipt.receipt_hash) return false;
    const digest = receiptSigningDigest(
      receipt as unknown as Record<string, unknown>,
      receipt.key_id,
    );
    const publicKey = Buffer.from(publicKeyB64, "base64");
    const signature = Buffer.from(receipt.sig_value_b64, "base64");
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return await ed.verifyAsync(signature, digest, publicKey);
  } catch {
    return false;
  }
}

export function newReceiptId(): string {
  return `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function buildReceiptBody(input: {
  organization_id: string;
  seq: number;
  prev_hash: string | null;
  case_id: string;
  decision_id: string;
  product?: string;
  event_type?: string;
  outcome: string;
  mode: "enforce" | "record_only";
  would_have?: string;
  policy?: ForensicReceiptBody["policy"];
  matched_rules: ForensicReceiptBody["matched_rules"];
  decision_basis?: ForensicReceiptBody["decision_basis"];
  plain_summary?: string;
  sealed_events: SealedEventRef[];
  approvals?: ForensicReceiptBody["approvals"];
  timeline?: ForensicReceiptBody["timeline"];
  attributes?: Record<string, unknown>;
  flags?: ForensicReceiptBody["flags"];
  key_id: string;
  issued_at?: string;
  receipt_id?: string;
}): ForensicReceiptBody {
  return {
    schema_version: 1,
    receipt_id: input.receipt_id ?? newReceiptId(),
    organization_id: input.organization_id,
    seq: input.seq,
    prev_hash: input.prev_hash,
    case_id: input.case_id,
    decision_id: input.decision_id,
    product: input.product,
    event_type: input.event_type,
    outcome: input.outcome,
    mode: input.mode,
    would_have: input.would_have,
    policy: input.policy,
    matched_rules: input.matched_rules,
    decision_basis: input.decision_basis,
    plain_summary: input.plain_summary,
    sealed_events: input.sealed_events,
    approvals: input.approvals,
    timeline: input.timeline,
    attributes: input.attributes,
    flags: input.flags,
    issued_at: input.issued_at ?? nowIso(),
    key_id: input.key_id,
  };
}
