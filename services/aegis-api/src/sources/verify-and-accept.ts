/**
 * Verify and accept an AEGIS-SRC1 signed envelope.
 *
 * 1. Cryptography (SDK verifyEnvelope) against the registered key the envelope names.
 * 2. Registry rules: key belongs to the source, key + source usable, envelope `ts` inside
 *    the key's validity window and within +/- AEGIS_SOURCE_TS_SKEW_SEC (default 300) of now.
 * 3. Under the per-source advisory lock `<org>:source_seq:<source_id>` (same style as
 *    forensic/issue.ts): idempotency, nonce, sequence. Then `process` runs inside the same
 *    transaction and the sequence/nonce/idempotency rows are written with its result.
 *
 * Sequence rules (last = source.last_seq):
 *   seq == last + 1  accept, advance
 *   seq  > last + 1  accept, record gap [last+1, seq-1], advance to seq
 *   seq <= last      reject as replay (409 seq_replay)
 *
 * One refinement: a seq <= last that lies inside a recorded gap was never accepted, so it
 * is not a replay. It is accepted as a late arrival (parallel senders deliver out of order)
 * and the gap shrinks or closes. Without this, 50 parallel senders would lose events.
 */
import {
  verifyEnvelope,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import type pg from "pg";
import {
  getSource,
  getSourceKey,
  type SourceKeyRow,
  type SourceRow,
} from "./registry.js";

export type SourceRejectCode =
  | "malformed"
  | "unsupported_version"
  | "event_hash_mismatch"
  | "bad_signature"
  | "unknown_key"
  | "key_source_mismatch"
  | "source_disabled"
  | "key_revoked"
  | "key_inactive"
  | "key_not_yet_valid"
  | "key_expired"
  | "timestamp_skew"
  | "nonce_reused"
  | "seq_replay"
  | "idempotency_conflict";

export type SourceRejection = {
  ok: false;
  status: 400 | 401 | 403 | 409;
  code: SourceRejectCode;
  message: string;
};

export type AcceptedSourceEnvelope = {
  envelope: SignedEnvelope;
  source: SourceRow;
  key: SourceKeyRow;
  /** Set when this envelope skipped sequence numbers. */
  gap: { from_seq: number; to_seq: number } | null;
  /** Set when this envelope arrived late and filled (part of) a recorded gap. */
  fills_gap: { from_seq: number; to_seq: number } | null;
};

export type SourceAcceptance<T> =
  | SourceRejection
  | { ok: true; idempotent: true; response: T }
  | {
      ok: true;
      idempotent: false;
      response: T;
      accepted: AcceptedSourceEnvelope;
    };

export type VerifyAndAcceptOptions<T> = {
  /** Runs inside the locked transaction; its return value is stored and returned. */
  process: (accepted: AcceptedSourceEnvelope) => Promise<T>;
  /** Test hook. */
  now?: () => Date;
  skewSeconds?: number;
};

const REJECTIONS: Record<
  SourceRejectCode,
  { status: SourceRejection["status"]; message: string }
> = {
  malformed: { status: 400, message: "The signed envelope is not well formed." },
  unsupported_version: {
    status: 400,
    message: "This envelope version is not supported (expected aegis_envelope \"1\").",
  },
  event_hash_mismatch: {
    status: 401,
    message: "The event does not match its event_hash; it was changed after signing.",
  },
  bad_signature: {
    status: 401,
    message: "The signature does not match the registered key for this source.",
  },
  unknown_key: {
    status: 401,
    message: "No registered key with that key_id exists for this organization.",
  },
  key_source_mismatch: {
    status: 401,
    message: "That key is registered to a different source than the envelope names.",
  },
  source_disabled: {
    status: 403,
    message: "This source is disabled. Events from it are not accepted.",
  },
  key_revoked: {
    status: 401,
    message: "This key has been revoked. Register a new key for the source.",
  },
  key_inactive: {
    status: 401,
    message: "This key was rotated out. Sign with the source's current key.",
  },
  key_not_yet_valid: {
    status: 401,
    message: "The envelope timestamp is before this key becomes valid.",
  },
  key_expired: {
    status: 401,
    message: "The envelope timestamp is after this key expired.",
  },
  timestamp_skew: {
    status: 400,
    message:
      "The envelope timestamp is too far from the server clock. Check the sending machine's clock.",
  },
  nonce_reused: {
    status: 409,
    message: "This nonce was already used by this source. Each envelope needs a fresh nonce.",
  },
  seq_replay: {
    status: 409,
    message:
      "This sequence number was already used (or is older than the latest accepted one) for this source.",
  },
  idempotency_conflict: {
    status: 409,
    message:
      "This idempotency key was already used for a different envelope. Use a new key for a new event.",
  },
};

export function reject(code: SourceRejectCode, detail?: string): SourceRejection {
  const base = REJECTIONS[code];
  return {
    ok: false,
    status: base.status,
    code,
    message: detail ? `${base.message} (${detail})` : base.message,
  };
}

export function readSkewSeconds(): number {
  const raw = Number(process.env.AEGIS_SOURCE_TS_SKEW_SEC);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300;
}

/** Nonces older than this cannot be replayed anyway (ts skew would refuse them). */
function nonceRetentionSeconds(skew: number): number {
  const raw = Number(process.env.AEGIS_SOURCE_NONCE_TTL_SEC);
  const configured = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
  return Math.max(configured, skew * 2 + 60);
}

type StoredIdempotency<T> = { event_hash: string; seq: number; response: T };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function lockName(organizationId: string, sourceId: string): string {
  return `${organizationId}:source_seq:${sourceId}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

/** Registry + time checks that need no sequence state. */
function checkKeyAndTime(
  key: SourceKeyRow,
  source: SourceRow,
  envelope: SignedEnvelope,
  now: Date,
  skewSeconds: number,
): SourceRejection | null {
  if (source.status !== "active") return reject("source_disabled");
  if (key.status === "revoked") return reject("key_revoked");
  if (key.status !== "active") return reject("key_inactive");
  const ts = Date.parse(envelope.ts);
  if (ts < key.valid_from.getTime()) return reject("key_not_yet_valid");
  if (key.valid_to && ts >= key.valid_to.getTime()) return reject("key_expired");
  if (Math.abs(now.getTime() - ts) > skewSeconds * 1000) {
    return reject("timestamp_skew");
  }
  return null;
}

export async function verifyAndAcceptEnvelope<T>(
  client: pg.PoolClient,
  organizationId: string,
  rawEnvelope: unknown,
  options: VerifyAndAcceptOptions<T>,
): Promise<SourceAcceptance<T>> {
  const now = options.now ?? (() => new Date());
  const skew = options.skewSeconds ?? readSkewSeconds();

  // ---- 1. Which key does the envelope claim? (no trust yet) -----------------
  if (!isPlainObject(rawEnvelope)) return reject("malformed", "envelope must be an object");
  if (rawEnvelope.aegis_envelope !== "1") return reject("unsupported_version");
  const { source_id: claimedSource, key_id: claimedKey } = rawEnvelope;
  if (typeof claimedSource !== "string" || typeof claimedKey !== "string") {
    return reject("malformed", "source_id and key_id are required");
  }

  const key = await getSourceKey(client, organizationId, claimedKey);
  if (!key) return reject("unknown_key");
  if (key.source_id !== claimedSource) return reject("key_source_mismatch");

  // ---- 2. Cryptographic verification ---------------------------------------
  const verified = await verifyEnvelope(rawEnvelope, key.public_key_b64);
  if (!verified.ok) {
    if (verified.reason === "malformed") return reject("malformed", verified.detail);
    if (verified.reason === "unsupported_version") return reject("unsupported_version");
    if (verified.reason === "event_hash_mismatch") return reject("event_hash_mismatch");
    return reject("bad_signature");
  }
  const envelope = rawEnvelope as unknown as SignedEnvelope;

  // ---- 3. Serialize per source and decide --------------------------------
  const lock = lockName(organizationId, envelope.source_id);
  await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [lock]);
  try {
    await client.query("BEGIN");
    try {
      const outcome = await decideAndProcess(
        client,
        organizationId,
        envelope,
        options.process,
        now(),
        skew,
      );
      if (outcome.ok) {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
      return outcome;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  } finally {
    await client
      .query(`SELECT pg_advisory_unlock(hashtext($1))`, [lock])
      .catch(() => undefined);
  }
}

async function decideAndProcess<T>(
  client: pg.PoolClient,
  organizationId: string,
  envelope: SignedEnvelope,
  process: VerifyAndAcceptOptions<T>["process"],
  now: Date,
  skew: number,
): Promise<SourceAcceptance<T>> {
  // Idempotency first: re-delivery of an accepted envelope must return the same answer,
  // even if the key was revoked or the clock moved on since.
  const idem = await client.query<{
    source_id: string;
    response_body: StoredIdempotency<T>;
  }>(
    `SELECT source_id, response_body
     FROM source_envelope_idempotency
     WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, envelope.idempotency_key],
  );
  const stored = idem.rows[0];
  if (stored) {
    if (
      stored.source_id !== envelope.source_id ||
      stored.response_body.event_hash !== envelope.event_hash
    ) {
      return reject("idempotency_conflict");
    }
    return { ok: true, idempotent: true, response: stored.response_body.response };
  }

  // Re-read key and source under the lock so a revocation is honoured.
  const key = await getSourceKey(client, organizationId, envelope.key_id);
  const source = await getSource(client, organizationId, envelope.source_id);
  if (!key) return reject("unknown_key");
  if (!source) return reject("key_source_mismatch");
  const refusal = checkKeyAndTime(key, source, envelope, now, skew);
  if (refusal) return refusal;

  // Nonce window: purge what ts-skew already makes unreplayable, then check.
  await client.query(
    `DELETE FROM source_nonce
     WHERE organization_id = $1 AND source_id = $2
       AND seen_at < now() - make_interval(secs => $3)`,
    [organizationId, envelope.source_id, nonceRetentionSeconds(skew)],
  );
  const nonce = await client.query(
    `SELECT 1 FROM source_nonce
     WHERE organization_id = $1 AND source_id = $2 AND nonce = $3`,
    [organizationId, envelope.source_id, envelope.nonce],
  );
  if ((nonce.rowCount ?? 0) > 0) return reject("nonce_reused");

  // Sequence.
  const seqRow = await client.query<{ last_seq: string }>(
    `SELECT last_seq::text FROM source
     WHERE organization_id = $1 AND source_id = $2 FOR UPDATE`,
    [organizationId, envelope.source_id],
  );
  const last = Number(seqRow.rows[0]?.last_seq ?? 0);

  // seq <= last is a replay, unless it lands inside a recorded gap: that number was
  // never accepted (it only arrived late, e.g. parallel senders), so it fills the gap.
  let filled: { from_seq: number; to_seq: number; detected_at: Date } | null = null;
  if (envelope.seq <= last) {
    const hit = await client.query<{
      from_seq: string;
      to_seq: string;
      detected_at: Date;
    }>(
      `SELECT from_seq::text, to_seq::text, detected_at
       FROM source_sequence_gap
       WHERE organization_id = $1 AND source_id = $2
         AND from_seq <= $3 AND to_seq >= $3
       FOR UPDATE`,
      [organizationId, envelope.source_id, envelope.seq],
    );
    if (!hit.rows[0]) return reject("seq_replay");
    filled = {
      from_seq: Number(hit.rows[0].from_seq),
      to_seq: Number(hit.rows[0].to_seq),
      detected_at: hit.rows[0].detected_at,
    };
  }
  const gap =
    envelope.seq > last + 1
      ? { from_seq: last + 1, to_seq: envelope.seq - 1 }
      : null;

  const accepted: AcceptedSourceEnvelope = {
    envelope,
    source,
    key,
    gap,
    fills_gap: filled ? { from_seq: filled.from_seq, to_seq: filled.to_seq } : null,
  };
  const response = await process(accepted);

  // Writes (the same transaction as the decision; `process` may have restarted it).
  await client.query(
    `INSERT INTO source_nonce (organization_id, source_id, nonce)
     VALUES ($1, $2, $3)`,
    [organizationId, envelope.source_id, envelope.nonce],
  );
  if (filled) {
    await client.query(
      `DELETE FROM source_sequence_gap
       WHERE organization_id = $1 AND source_id = $2 AND from_seq = $3`,
      [organizationId, envelope.source_id, filled.from_seq],
    );
    const remaining: Array<[number, number]> = [];
    if (filled.from_seq < envelope.seq) remaining.push([filled.from_seq, envelope.seq - 1]);
    if (envelope.seq < filled.to_seq) remaining.push([envelope.seq + 1, filled.to_seq]);
    for (const [from, to] of remaining) {
      await client.query(
        `INSERT INTO source_sequence_gap
           (organization_id, source_id, from_seq, to_seq, detected_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [organizationId, envelope.source_id, from, to, filled.detected_at],
      );
    }
    await client.query(
      `UPDATE source
       SET last_event_at = GREATEST(last_event_at, $3::timestamptz), updated_at = now()
       WHERE organization_id = $1 AND source_id = $2`,
      [organizationId, envelope.source_id, envelope.ts],
    );
  } else {
    if (gap) {
      await client.query(
        `INSERT INTO source_sequence_gap (organization_id, source_id, from_seq, to_seq)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [organizationId, envelope.source_id, gap.from_seq, gap.to_seq],
      );
    }
    await client.query(
      `UPDATE source
       SET last_seq = $3, last_event_at = $4, updated_at = now()
       WHERE organization_id = $1 AND source_id = $2`,
      [organizationId, envelope.source_id, envelope.seq, envelope.ts],
    );
  }
  const receiptId =
    isPlainObject(response) && typeof response.receipt_id === "string"
      ? response.receipt_id
      : null;
  const body: StoredIdempotency<T> = {
    event_hash: envelope.event_hash,
    seq: envelope.seq,
    response,
  };
  try {
    await client.query(
      `INSERT INTO source_envelope_idempotency
         (organization_id, idempotency_key, source_id, response_body, receipt_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        organizationId,
        envelope.idempotency_key,
        envelope.source_id,
        JSON.stringify(body),
        receiptId,
      ],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return reject("idempotency_conflict");
    throw err;
  }

  return { ok: true, idempotent: false, response, accepted };
}
