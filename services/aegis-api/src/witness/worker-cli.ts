/**
 * Merkle witness worker — batches pending events on a fixed cadence (default 60s).
 * Run via Railway cron or: pnpm --filter aegis-api witness:worker
 */
import "../db/load-env.js";
import { getPool } from "../db/pool.js";
import { publishTransparencyLogForOrg } from "../transparency/publish.js";
import { recordWorkerRunResult } from "../workers/record-run.js";
import { listOrganizationIds, runWitnessBatchForOrg } from "./batch.js";

const intervalMs = Math.max(
  10_000,
  Number.parseInt(process.env.WITNESS_INTERVAL_MS ?? "60000", 10) || 60_000,
);
const runOnce = process.argv.includes("--once");

async function tick(): Promise<void> {
  const pool = getPool();
  const startedAt = new Date();
  try {
    const orgIds = await listOrganizationIds(pool);
    const results: Array<{ organization_id: string; root_id?: string; tree_size?: number }> =
      [];

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
    }

    const summary = {
      interval_ms: intervalMs,
      organizations_scanned: orgIds.length,
      batches: results,
      batch_count: results.length,
    };

    await recordWorkerRunResult(pool, {
      workerName: "witness",
      status: results.length > 0 ? "ok" : "skipped",
      startedAt,
      summary,
    });

    if (results.length > 0) {
      console.log(
        JSON.stringify({
          ok: true,
          at: new Date().toISOString(),
          ...summary,
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordWorkerRunResult(pool, {
      workerName: "witness",
      status: "error",
      startedAt,
      summary: { interval_ms: intervalMs },
      errorMessage: message,
    });
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
  await tick();
  setInterval(() => {
    void tick().catch((err) => console.error("[witness-worker] tick failed:", err));
  }, intervalMs);
}
