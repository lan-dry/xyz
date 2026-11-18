/**
 * RFC 3161 timestamps for Merkle witness roots (A5).
 * Reuses the receipt TSA client (requestReceiptStamp / createCheckpointTimestamp).
 *
 * When AEGIS_TSA_URL is set, roots are stamped by the outside authority (with
 * retry). When unset, createCheckpointTimestamp stores a local-test token so
 * offline verifiers still have a token in the bundle (dev / tests only).
 */
import type pg from "pg";
import {
  createCheckpointTimestamp,
  createLocalTestTimestamp,
} from "../forensic/rfc3161.js";
import {
  nextAttemptDelaySeconds,
  requestReceiptStamp,
} from "../forensic/receipt-timestamp.js";
import { getTsaConfig } from "../forensic/tsa.js";

export type RootTimestampStatus = "pending" | "stamped";

export type RootTimestamp = {
  root_id: string;
  status: RootTimestampStatus;
  authority: string | null;
  tsa_url: string | null;
  gen_time_utc: string | null;
  message_hash: string;
  token_b64: string | null;
};

function messageHashForRoot(rootHash: string): string {
  const hex = rootHash.replace(/^sha256:/i, "").toLowerCase();
  return `sha256:${hex}`;
}

/**
 * Stamp one root immediately after publish. Never throws — batch must succeed
 * even when the TSA is down (row stays pending for retry).
 */
export async function stampWitnessRootNow(
  client: pg.Pool | pg.PoolClient,
  root: { root_id: string; root_hash: string },
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<"stamped" | "pending" | "error"> {
  const messageHash = messageHashForRoot(root.root_hash);
  const config = getTsaConfig();

  try {
    if (config) {
      const attempt = await requestReceiptStamp(messageHash, config, options);
      if (attempt.ok) {
        await client.query(
          `UPDATE merkle_root
           SET tsa_status = 'stamped',
               tsa_authority = $2,
               tsa_url = $3,
               tsa_gen_time = $4,
               tsa_token_b64 = $5,
               tsa_message_hash = $6,
               tsa_last_error = NULL,
               tsa_next_attempt_at = NULL
           WHERE root_id = $1`,
          [
            root.root_id,
            attempt.authority,
            attempt.tsa_url,
            attempt.gen_time_utc,
            attempt.token_b64,
            messageHash,
          ],
        );
        return "stamped";
      }
      await client.query(
        `UPDATE merkle_root
         SET tsa_status = 'pending',
             tsa_message_hash = $2,
             tsa_last_error = $3,
             tsa_next_attempt_at = now() + make_interval(secs => $4)
         WHERE root_id = $1`,
        [
          root.root_id,
          messageHash,
          attempt.error.slice(0, 300),
          nextAttemptDelaySeconds(1),
        ],
      );
      return "pending";
    }

    // No public TSA: store a local-test token so bundles remain complete offline.
    const token = createLocalTestTimestamp(messageHash);
    await client.query(
      `UPDATE merkle_root
       SET tsa_status = 'stamped',
           tsa_authority = 'local-test-tsa',
           tsa_url = NULL,
           tsa_gen_time = $2::timestamptz,
           tsa_token_b64 = $3,
           tsa_message_hash = $4,
           tsa_last_error = NULL,
           tsa_next_attempt_at = NULL
       WHERE root_id = $1`,
      [root.root_id, token.issued_at, token.token_b64, messageHash],
    );
    return "stamped";
  } catch (err) {
    console.warn(
      "[witness-tsa] stamp failed:",
      err instanceof Error ? err.message : err,
    );
    try {
      await client.query(
        `UPDATE merkle_root
         SET tsa_status = 'pending',
             tsa_message_hash = $2,
             tsa_last_error = $3,
             tsa_next_attempt_at = now() + make_interval(secs => 15)
         WHERE root_id = $1`,
        [
          root.root_id,
          messageHash,
          (err instanceof Error ? err.message : String(err)).slice(0, 300),
        ],
      );
    } catch {
      /* older DB without tsa columns */
    }
    return "error";
  }
}

export type ProcessRootTimestampResult = {
  attempted: number;
  stamped: number;
  failed: number;
};

/** Retry pending witness-root timestamps (same TSA as receipts). */
export async function processPendingRootTimestamps(
  pool: pg.Pool | pg.PoolClient,
  options?: {
    limit?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<ProcessRootTimestampResult> {
  const config = getTsaConfig(options?.env ?? process.env);
  const result: ProcessRootTimestampResult = {
    attempted: 0,
    stamped: 0,
    failed: 0,
  };
  if (!config) return result;

  const leaseSeconds = Math.max(
    30,
    Math.ceil((options?.timeoutMs ?? 10_000) / 1000) * 2,
  );

  let claimed: Array<{ root_id: string; root_hash: string; attempts: number }>;
  try {
    const rows = await pool.query<{
      root_id: string;
      root_hash: string;
      attempts: number;
    }>(
      `UPDATE merkle_root
       SET tsa_next_attempt_at = now() + make_interval(secs => $2)
       WHERE root_id IN (
         SELECT root_id FROM merkle_root
         WHERE tsa_status = 'pending'
           AND (tsa_next_attempt_at IS NULL OR tsa_next_attempt_at <= now())
         ORDER BY COALESCE(tsa_next_attempt_at, published_at, interval_end) ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING root_id, root_hash,
         CASE
           WHEN tsa_last_error IS NULL THEN 1
           ELSE 2
         END AS attempts`,
      [options?.limit ?? 20, leaseSeconds],
    );
    claimed = rows.rows;
  } catch (err) {
    if ((err as { code?: string }).code === "42703") {
      // column missing — migration not applied yet
      return result;
    }
    throw err;
  }

  for (const row of claimed) {
    result.attempted += 1;
    const messageHash = messageHashForRoot(row.root_hash);
    const attempt = await requestReceiptStamp(messageHash, config, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs,
    });
    if (attempt.ok) {
      await pool.query(
        `UPDATE merkle_root
         SET tsa_status = 'stamped',
             tsa_authority = $2,
             tsa_url = $3,
             tsa_gen_time = $4,
             tsa_token_b64 = $5,
             tsa_message_hash = $6,
             tsa_last_error = NULL,
             tsa_next_attempt_at = NULL
         WHERE root_id = $1`,
        [
          row.root_id,
          attempt.authority,
          attempt.tsa_url,
          attempt.gen_time_utc,
          attempt.token_b64,
          messageHash,
        ],
      );
      result.stamped += 1;
    } else {
      await pool.query(
        `UPDATE merkle_root
         SET tsa_last_error = $2,
             tsa_next_attempt_at = now() + make_interval(secs => $3)
         WHERE root_id = $1`,
        [
          row.root_id,
          attempt.error.slice(0, 300),
          nextAttemptDelaySeconds(row.attempts),
        ],
      );
      result.failed += 1;
    }
  }
  return result;
}

/**
 * Backfill timestamps on roots created before A5 (or before TSA was configured).
 * Uses createCheckpointTimestamp (real TSA when configured, else local-test).
 */
export async function backfillRootTimestamps(
  client: pg.Pool | pg.PoolClient,
  organizationId?: string,
): Promise<number> {
  let rows: Array<{ root_id: string; root_hash: string }>;
  try {
    const result = await client.query<{ root_id: string; root_hash: string }>(
      organizationId
        ? `SELECT root_id, root_hash FROM merkle_root
           WHERE organization_id = $1
             AND (tsa_status IS NULL OR (tsa_status = 'pending' AND tsa_token_b64 IS NULL))
           ORDER BY interval_end ASC
           LIMIT 50`
        : `SELECT root_id, root_hash FROM merkle_root
           WHERE tsa_status IS NULL OR (tsa_status = 'pending' AND tsa_token_b64 IS NULL)
           ORDER BY interval_end ASC
           LIMIT 50`,
      organizationId ? [organizationId] : [],
    );
    rows = result.rows;
  } catch (err) {
    if ((err as { code?: string }).code === "42703") return 0;
    throw err;
  }

  let stamped = 0;
  for (const row of rows) {
    const messageHash = messageHashForRoot(row.root_hash);
    try {
      const token = await createCheckpointTimestamp(messageHash);
      const authority =
        token.alg === "rfc3161"
          ? getTsaConfig()?.authority ?? token.tsa_url ?? "RFC 3161 TSA"
          : "local-test-tsa";
      await client.query(
        `UPDATE merkle_root
         SET tsa_status = 'stamped',
             tsa_authority = $2,
             tsa_url = $3,
             tsa_gen_time = $4::timestamptz,
             tsa_token_b64 = $5,
             tsa_message_hash = $6,
             tsa_last_error = NULL,
             tsa_next_attempt_at = NULL
         WHERE root_id = $1`,
        [
          row.root_id,
          authority,
          token.tsa_url ?? null,
          token.issued_at,
          token.token_b64,
          messageHash,
        ],
      );
      stamped += 1;
    } catch (err) {
      await client.query(
        `UPDATE merkle_root
         SET tsa_status = 'pending',
             tsa_message_hash = $2,
             tsa_last_error = $3,
             tsa_next_attempt_at = now() + make_interval(secs => 15)
         WHERE root_id = $1`,
        [
          row.root_id,
          messageHash,
          (err instanceof Error ? err.message : String(err)).slice(0, 300),
        ],
      );
    }
  }
  return stamped;
}
