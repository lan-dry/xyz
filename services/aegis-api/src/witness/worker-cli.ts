/**
 * Merkle witness worker — batches pending events on a fixed cadence (default 60s).
 * Run via Railway cron or: pnpm --filter aegis-api witness:worker
 */
import "../db/load-env.js";
import { getPool } from "../db/pool.js";
import { publishTransparencyLogForOrg } from "../transparency/publish.js";
import { recordWorkerRunResult } from "../workers/record-run.js";
import {
  backfillWitnessCompleteness,
  listOrganizationIds,
  runWitnessBatchForOrg,
} from "./batch.js";

const intervalMs = Math.max(
  10_000,
  Number.parseInt(process.env.WITNESS_INTERVAL_MS ?? "60000", 10) || 60_000,
);
const runOnce = process.argv.includes("--once");

/** Postgres undefined_table — empty / unmigrated database. */
function isMissingRelation(err: unknown): boolean {
  return (err as { code?: string }).code === "42P01";
}

async function tick(): Promise<void> {
  const pool = getPool();
  const startedAt = new Date();
  try {
    const orgIds = await listOrganizationIds(pool);
    const results: Array<{ organization_id: string; root_id?: string; tree_size?: number }> =
      [];

    let checkpointsBackfilled = 0;
    let timestampsBackfilled = 0;
    for (const organizationId of orgIds) {
      const batch = await runWitnessBatchForOrg(pool, organizationId);
      if (batch) {
        results.push({
          organization_id: organizationId,
          root_id: batch.root_id,
          tree_size: batch.tree_size,
        });
        try {
          await publishTransparencyLogForOrg(pool, organizationId);
        } catch (err) {
          console.error(
            `[witness-worker] transparency publish failed for ${organizationId}:`,
            err,
          );
        }
      }
      try {
        const catchUp = await backfillWitnessCompleteness(pool, organizationId);
        checkpointsBackfilled += catchUp.signed;
        timestampsBackfilled += catchUp.stamped + catchUp.retried;
      } catch (err) {
        console.error(
          `[witness-worker] checkpoint backfill failed for ${organizationId}:`,
          err,
        );
      }
    }

    const summary = {
      interval_ms: intervalMs,
      organizations_scanned: orgIds.length,
      batches: results,
      batch_count: results.length,
      checkpoints_backfilled: checkpointsBackfilled,
      timestamps_backfilled: timestampsBackfilled,
    };

    await recordWorkerRunResult(pool, {
      workerName: "witness",
      status:
        results.length > 0 ||
        checkpointsBackfilled > 0 ||
        timestampsBackfilled > 0
          ? "ok"
          : "skipped",
      startedAt,
      summary,
    });

    if (
      results.length > 0 ||
      checkpointsBackfilled > 0 ||
      timestampsBackfilled > 0 ||
      runOnce
    ) {
      console.log(
        JSON.stringify({
          ok: true,
          at: new Date().toISOString(),
          ...summary,
        }),
      );
    }
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn(
        "[witness-worker] database schema missing; migrate on aegis-api (MIGRATION_DATABASE_URL / preDeploy), then wait — will retry",
      );
      if (runOnce) process.exitCode = 1;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    try {
      await recordWorkerRunResult(pool, {
        workerName: "witness",
        status: "error",
        startedAt,
        summary: { interval_ms: intervalMs },
        errorMessage: message,
      });
    } catch {
      // recordWorkerRunResult already warns if worker_run table is missing
    }
    throw err;
  }
}

if (runOnce) {
  await tick();
  await getPool().end();
} else {
  console.log(
    `[witness-worker] starting; interval=${intervalMs}ms (set WITNESS_INTERVAL_MS to change)`,
  );
  await tick().catch((err) => {
    console.error("[witness-worker] tick failed:", err);
  });
  setInterval(() => {
    void tick().catch((err) => console.error("[witness-worker] tick failed:", err));
  }, intervalMs);
}
