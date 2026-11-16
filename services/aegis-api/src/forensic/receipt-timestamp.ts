/**
 * Trusted time for forensic receipts (RFC 3161, AEGIS_TSA_URL).
 *
 * The receipt is signed and issued immediately; the outside time stamp over
 * receipt_hash is attached afterwards. A row is queued (status "pending") in
 * the same connection that wrote the receipt and is stamped by the retry loop
 * (startTimestampLoop in the API process, or processPendingTimestamps from a
 * worker). If the TSA is unreachable the row stays pending and is retried with
 * backoff; the receipt is never blocked or lost.
 */
import type pg from "pg";
import { requestRfc3161Timestamp } from "./rfc3161.js";
import { getTsaConfig, parseRfc3161Reply, type TsaConfig } from "./tsa.js";

export type ReceiptTimestampStatus = "pending" | "stamped";

export type ReceiptTimestamp = {
  receipt_id: string;
  status: ReceiptTimestampStatus;
  authority: string | null;
  tsa_url: string | null;
  /** UTC time asserted by the authority (null until stamped). */
  gen_time_utc: string | null;
  message_hash: string;
  token_b64: string | null;
  attempts: number;
  last_error: string | null;
};

export type StampAttempt =
  | {
      ok: true;
      gen_time_utc: string;
      token_b64: string;
      authority: string;
      tsa_url: string;
    }
  | { ok: false; error: string };

/** 15s, 30s, 60s ... capped at 1h. */
export function nextAttemptDelaySeconds(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(3600, 15 * 2 ** (n - 1));
}

function hexOfHash(messageHash: string): string {
  return messageHash.replace(/^sha256:/i, "").toLowerCase();
}

/**
 * One request to the TSA, fully validated: HTTP ok, PKIStatus granted, the
 * token's messageImprint equals our hash, genTime readable. Pure (no DB).
 */
export async function requestReceiptStamp(
  messageHash: string,
  config: TsaConfig,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<StampAttempt> {
  const result = await requestRfc3161Timestamp(messageHash, {
    tsaUrl: config.url,
    fetchImpl: options?.fetchImpl,
    timeoutMs: options?.timeoutMs ?? 10_000,
  });
  if (!result.ok || !result.token) {
    return { ok: false, error: result.error ?? "TSA request failed" };
  }
  const reply = Buffer.from(result.token.token_b64, "base64");
  const parsed = parseRfc3161Reply(reply);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.message_hash_hex !== hexOfHash(messageHash)) {
    return {
      ok: false,
      error: "TSA token is for a different hash (messageImprint mismatch)",
    };
  }
  return {
    ok: true,
    gen_time_utc: parsed.gen_time,
    token_b64: result.token.token_b64,
    authority: config.authority,
    tsa_url: config.url,
  };
}

/**
 * Queue a trusted-time stamp for a freshly issued receipt. No-op when no TSA is
 * configured. Never throws: trusted time must not block receipt issuance.
 */
export async function scheduleReceiptTimestamp(
  client: pg.Pool | pg.PoolClient,
  receipt: { receipt_id: string; organization_id: string; receipt_hash: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<"scheduled" | "disabled" | "error"> {
  if (!getTsaConfig(env)) return "disabled";
  try {
    await client.query(
      `INSERT INTO forensic_receipt_timestamp
         (receipt_id, organization_id, message_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (receipt_id) DO NOTHING`,
      [receipt.receipt_id, receipt.organization_id, receipt.receipt_hash],
    );
    return "scheduled";
  } catch (err) {
    console.warn(
      "[trusted-time] could not queue timestamp:",
      err instanceof Error ? err.message : err,
    );
    return "error";
  }
}

type PendingRow = {
  receipt_id: string;
  message_hash: string;
  attempts: number;
};

export type ProcessResult = {
  attempted: number;
  stamped: number;
  failed: number;
};

/**
 * Stamp queued receipts that are due. Rows are leased (next_attempt_at pushed
 * out) before the HTTP call so concurrent workers never double-send, and a
 * crashed worker's rows simply become due again.
 */
export async function processPendingTimestamps(
  pool: pg.Pool | pg.PoolClient,
  options?: {
    limit?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<ProcessResult> {
  const config = getTsaConfig(options?.env ?? process.env);
  const result: ProcessResult = { attempted: 0, stamped: 0, failed: 0 };
  if (!config) return result;

  const leaseSeconds = Math.max(
    30,
    Math.ceil((options?.timeoutMs ?? 10_000) / 1000) * 2,
  );
  const claimed = await pool.query<PendingRow>(
    `UPDATE forensic_receipt_timestamp
     SET next_attempt_at = now() + make_interval(secs => $2),
         attempts = attempts + 1,
         updated_at = now()
     WHERE receipt_id IN (
       SELECT receipt_id FROM forensic_receipt_timestamp
       WHERE status = 'pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING receipt_id, message_hash, attempts`,
    [options?.limit ?? 20, leaseSeconds],
  );

  for (const row of claimed.rows) {
    result.attempted += 1;
    const attempt = await requestReceiptStamp(row.message_hash, config, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs,
    });
    if (attempt.ok) {
      await pool.query(
        `UPDATE forensic_receipt_timestamp
         SET status = 'stamped', authority = $2, tsa_url = $3, gen_time = $4,
             token_b64 = $5, last_error = NULL, updated_at = now()
         WHERE receipt_id = $1`,
        [
          row.receipt_id,
          attempt.authority,
          attempt.tsa_url,
          attempt.gen_time_utc,
          attempt.token_b64,
        ],
      );
      result.stamped += 1;
    } else {
      await pool.query(
        `UPDATE forensic_receipt_timestamp
         SET last_error = $2,
             next_attempt_at = now() + make_interval(secs => $3),
             updated_at = now()
         WHERE receipt_id = $1`,
        [
          row.receipt_id,
          attempt.error.slice(0, 300),
          nextAttemptDelaySeconds(row.attempts),
        ],
      );
      result.failed += 1;
    }
  }
  return result;
}

/** Stamp one receipt right now (used by tests and one-off tooling). */
export async function stampReceiptNow(
  pool: pg.Pool | pg.PoolClient,
  receiptId: string,
  options?: Parameters<typeof processPendingTimestamps>[1],
): Promise<ProcessResult> {
  await pool.query(
    `UPDATE forensic_receipt_timestamp SET next_attempt_at = now()
     WHERE receipt_id = $1 AND status = 'pending'`,
    [receiptId],
  );
  return processPendingTimestamps(pool, options);
}

export async function getReceiptTimestamps(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  receiptIds: string[],
): Promise<ReceiptTimestamp[]> {
  if (receiptIds.length === 0) return [];
  const rows = await client.query<{
    receipt_id: string;
    status: ReceiptTimestampStatus;
    authority: string | null;
    tsa_url: string | null;
    gen_time: Date | null;
    message_hash: string;
    token_b64: string | null;
    attempts: number;
    last_error: string | null;
  }>(
    `SELECT receipt_id, status, authority, tsa_url, gen_time, message_hash,
            token_b64, attempts, last_error
     FROM forensic_receipt_timestamp
     WHERE organization_id = $1 AND receipt_id = ANY($2::text[])`,
    [organizationId, receiptIds],
  );
  return rows.rows.map((r) => ({
    receipt_id: r.receipt_id,
    status: r.status,
    authority: r.authority,
    tsa_url: r.tsa_url,
    gen_time_utc: r.gen_time ? r.gen_time.toISOString() : null,
    message_hash: r.message_hash,
    token_b64: r.token_b64,
    attempts: r.attempts,
    last_error: r.last_error,
  }));
}

export async function countPendingTimestamps(
  client: pg.Pool | pg.PoolClient,
): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM forensic_receipt_timestamp WHERE status = 'pending'`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Background retry loop for the API process. Interval from
 * AEGIS_TSA_RETRY_INTERVAL_SECONDS (default 15). Returns a stop function.
 */
export function startTimestampLoop(
  getPool: () => pg.Pool,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  if (!getTsaConfig(env)) return () => undefined;
  const seconds = Math.max(
    5,
    Number.parseInt(env.AEGIS_TSA_RETRY_INTERVAL_SECONDS ?? "15", 10) || 15,
  );
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processPendingTimestamps(getPool(), { env })
      .catch((err) => {
        console.warn(
          "[trusted-time] retry loop error:",
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
        running = false;
      });
  }, seconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
