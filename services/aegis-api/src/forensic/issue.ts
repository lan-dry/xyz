import type pg from "pg";
import {
  buildReceiptBody,
  signForensicReceiptWith,
  type ForensicReceiptBody,
  type SealedEventRef,
  type SignedForensicReceipt,
} from "./receipt.js";
import { isDemoClockActive, nowIso } from "../bank/demo-clock.js";
import { resolveReceiptSigning } from "../crypto/receipt-signing.js";
import { publishReceiptSigningKey } from "../repo/receipt-keys.js";
import { scheduleReceiptTimestamp } from "./receipt-timestamp.js";

function isPoolClient(
  client: pg.Pool | pg.PoolClient,
): client is pg.PoolClient {
  return typeof (client as pg.PoolClient).release === "function";
}

/**
 * Allocate the next receipt sequence under a lock that survives across
 * statements. SELECT FOR UPDATE alone is a no-op under autocommit (each
 * statement is its own transaction), which caused duplicate
 * (organization_id, seq) under concurrent issueForensicReceipt.
 */
export async function nextReceiptSeq(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ seq: number; prev_hash: string | null }> {
  await client.query(`SELECT pg_advisory_lock(hashtext($1 || ':receipt_seq'))`, [
    organizationId,
  ]);
  try {
    await client.query(
      `INSERT INTO forensic_receipt_seq (organization_id, next_seq, head_hash)
       VALUES ($1, 1, NULL)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId],
    );
    const row = await client.query<{
      next_seq: string;
      head_hash: string | null;
    }>(
      `SELECT next_seq::text, head_hash FROM forensic_receipt_seq
       WHERE organization_id = $1 FOR UPDATE`,
      [organizationId],
    );
    const seq = Number(row.rows[0]?.next_seq ?? 1);
    const prev_hash = row.rows[0]?.head_hash ?? null;
    return { seq, prev_hash };
  } catch (err) {
    await client.query(
      `SELECT pg_advisory_unlock(hashtext($1 || ':receipt_seq'))`,
      [organizationId],
    );
    throw err;
  }
}

/** Release the lock taken by nextReceiptSeq (after persist + commitReceiptSeq). */
export async function unlockReceiptSeq(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_unlock(hashtext($1 || ':receipt_seq'))`,
    [organizationId],
  );
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
 * Signs with AWS KMS (AEGIS_RECEIPT_KMS_KEY_ID) when set, else the software
 * seed AEGIS_RECEIPT_SIGNING_KEY_B64 + AEGIS_RECEIPT_KEY_ID, or the signingKey
 * override (tests / demo). Production requires KMS or the interim flag.
 */
export async function issueForensicReceipt(
  client: pg.Pool | pg.PoolClient,
  input: {
    organization_id: string;
    case_id: string;
    decision_id: string;
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
    decision_basis?: ForensicReceiptBody["decision_basis"];
    plain_summary?: string;
    sealed_events: SealedEventRef[];
    attributes?: Record<string, unknown>;
    timeline?: Array<Record<string, unknown>>;
    approvals?: Array<Record<string, unknown>>;
    flags?: {
      demo_clock?: boolean;
      decided_without_aegis?: boolean;
      provisional?: boolean;
    };
    /** Test / demo software key override. Refused when AEGIS_ENV=production. */
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<SignedForensicReceipt> {
  // KMS when AEGIS_RECEIPT_KMS_KEY_ID is set, else software key. In production
  // this throws unless KMS or the explicit interim software flag is configured.
  const signing = await resolveReceiptSigning({
    override: input.signingKey
      ? {
          key_id: input.signingKey.key_id,
          private_key_b64: input.signingKey.private_key_b64,
        }
      : undefined,
  });
  const keyId = signing.key_id;
  await publishReceiptSigningKey(client, signing);

  // Allocate + insert + advance on one connection under the advisory lock
  // taken by nextReceiptSeq (released in unlockReceiptSeq).
  const run = async (c: pg.Pool | pg.PoolClient) => {
    const { seq, prev_hash } = await nextReceiptSeq(c, input.organization_id);
    try {
      const provisionalFromEvents = input.sealed_events.some((e) =>
        e.event_id.startsWith("evt_gov_"),
      );
      const flags = {
        ...(isDemoClockActive() ? { demo_clock: true as const } : {}),
        // Signed into the body so custody cannot be stripped after the fact.
        ...(signing.custody === "kms" || signing.custody === "software_interim"
          ? { key_custody: signing.custody }
          : {}),
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
        attributes: input.attributes,
        timeline: input.timeline,
        approvals: input.approvals,
        flags: Object.keys(flags).length > 0 ? flags : undefined,
        key_id: keyId,
        issued_at: nowIso(),
      });
      const signed = await signForensicReceiptWith(body, signing);
      await persistForensicReceipt(c, signed);
      await commitReceiptSeq(
        c,
        input.organization_id,
        seq + 1,
        signed.receipt_hash,
      );
      // Trusted time is attached later (retried while the TSA is unreachable);
      // queueing never throws, so the receipt is always issued.
      await scheduleReceiptTimestamp(c, signed);
      return signed;
    } finally {
      await unlockReceiptSeq(c, input.organization_id);
    }
  };

  if (isPoolClient(client)) {
    return run(client);
  }
  const c = await client.connect();
  try {
    return await run(c);
  } finally {
    c.release();
  }
}
