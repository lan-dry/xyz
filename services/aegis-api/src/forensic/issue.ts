import type pg from "pg";
import {
  buildReceiptBody,
  signForensicReceipt,
  type SealedEventRef,
  type SignedForensicReceipt,
} from "./receipt.js";
import { isDemoClockActive, nowIso } from "../bank/demo-clock.js";

export async function nextReceiptSeq(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ seq: number; prev_hash: string | null }> {
  await client.query(
    `INSERT INTO forensic_receipt_seq (organization_id, next_seq, head_hash)
     VALUES ($1, 1, NULL)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId],
  );
  const row = await client.query<{ next_seq: string; head_hash: string | null }>(
    `SELECT next_seq::text, head_hash FROM forensic_receipt_seq
     WHERE organization_id = $1 FOR UPDATE`,
    [organizationId],
  );
  const seq = Number(row.rows[0]?.next_seq ?? 1);
  const prev_hash = row.rows[0]?.head_hash ?? null;
  return { seq, prev_hash };
}

export async function commitReceiptSeq(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  nextSeq: number,
  headHash: string,
): Promise<void> {
  await client.query(
    `UPDATE forensic_receipt_seq
     SET next_seq = $2, head_hash = $3
     WHERE organization_id = $1`,
    [organizationId, nextSeq, headHash],
  );
}

export async function persistForensicReceipt(
  client: pg.Pool | pg.PoolClient,
  receipt: SignedForensicReceipt,
): Promise<void> {
  await client.query(
    `INSERT INTO forensic_receipt (
       receipt_id, organization_id, seq, prev_hash, receipt_hash,
       case_id, decision_id, outcome, mode, body, key_id, sig_alg, sig_value_b64, issued_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14::timestamptz
     )`,
    [
      receipt.receipt_id,
      receipt.organization_id,
      receipt.seq,
      receipt.prev_hash,
      receipt.receipt_hash,
      receipt.case_id,
      receipt.decision_id,
      receipt.outcome,
      receipt.mode,
      JSON.stringify(receipt),
      receipt.key_id,
      receipt.sig_alg,
      receipt.sig_value_b64,
      receipt.issued_at,
    ],
  );
}

/**
 * Issue a signed forensic receipt citing sealed events.
 * Requires AEGIS_RECEIPT_SIGNING_KEY_B64 (32-byte seed) + AEGIS_RECEIPT_KEY_ID,
 * or signingKey override (tests / demo).
 */
export async function issueForensicReceipt(
  client: pg.Pool | pg.PoolClient,
  input: {
    organization_id: string;
    case_id: string;
    decision_id: string;
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
    sealed_events: SealedEventRef[];
    attributes?: Record<string, unknown>;
    timeline?: Array<Record<string, unknown>>;
    approvals?: Array<Record<string, unknown>>;
    flags?: {
      demo_clock?: boolean;
      decided_without_aegis?: boolean;
      provisional?: boolean;
    };
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<SignedForensicReceipt> {
  const envKey = process.env.AEGIS_RECEIPT_SIGNING_KEY_B64;
  const envKeyId = process.env.AEGIS_RECEIPT_KEY_ID ?? "receipt_dev";
  const keyId = input.signingKey?.key_id ?? envKeyId;
  const privateKeyB64 = input.signingKey?.private_key_b64 ?? envKey;
  if (!privateKeyB64) {
    throw new Error(
      "Receipt signing key not configured (AEGIS_RECEIPT_SIGNING_KEY_B64)",
    );
  }

  const { seq, prev_hash } = await nextReceiptSeq(client, input.organization_id);
  const provisionalFromEvents = input.sealed_events.some((e) =>
    e.event_id.startsWith("evt_gov_"),
  );
  const flags = {
    ...(isDemoClockActive() ? { demo_clock: true as const } : {}),
    ...(input.flags ?? {}),
    ...(provisionalFromEvents || input.flags?.provisional
      ? { provisional: true as const }
      : {}),
  };
  const body = buildReceiptBody({
    organization_id: input.organization_id,
    seq,
    prev_hash,
    case_id: input.case_id,
    decision_id: input.decision_id,
    outcome: input.outcome,
    mode: input.mode,
    would_have: input.would_have,
    policy: input.policy,
    matched_rules: input.matched_rules,
    sealed_events: input.sealed_events,
    attributes: input.attributes,
    timeline: input.timeline,
    approvals: input.approvals,
    flags: Object.keys(flags).length > 0 ? flags : undefined,
    key_id: keyId,
    issued_at: nowIso(),
  });
  const signed = await signForensicReceipt(body, privateKeyB64);
  await persistForensicReceipt(client, signed);
  await commitReceiptSeq(client, input.organization_id, seq + 1, signed.receipt_hash);
  return signed;
}
