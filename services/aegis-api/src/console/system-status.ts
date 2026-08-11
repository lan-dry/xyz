import type pg from "pg";

export type ConsoleSystemStatus = {
  witness: {
    state: "ok" | "degraded" | "unknown";
    label: string;
    detail: string;
    last_batch_at: string | null;
    last_run_at: string | null;
    pending_events: number;
    merkle_roots_total: number;
  };
  workers: {
    compliance: { last_run_at: string | null; status: string | null; label: string };
    housekeeping: { last_run_at: string | null; status: string | null; label: string };
  };
};

export async function getConsoleSystemStatus(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<ConsoleSystemStatus> {
  const pendingResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM event e
     WHERE e.organization_id = $1
       AND NOT EXISTS (SELECT 1 FROM inclusion_proof p WHERE p.event_id = e.event_id)`,
    [organizationId],
  );
  const pendingEvents = Number(pendingResult.rows[0]?.count ?? 0);

  const rootsResult = await client.query<{ count: string; latest: Date | null }>(
    `SELECT COUNT(*)::text AS count, MAX(interval_end) AS latest
     FROM merkle_root
     WHERE organization_id = $1`,
    [organizationId],
  );
  const merkleRootsTotal = Number(rootsResult.rows[0]?.count ?? 0);
  const lastBatchAt = rootsResult.rows[0]?.latest ?? null;

  let witnessRun: {
    started_at: Date;
    status: string;
    summary: Record<string, unknown>;
  } | null = null;
  try {
    const wr = await client.query<{
      started_at: Date;
      status: string;
      summary: Record<string, unknown> | string;
    }>(
      `SELECT started_at, status, summary
       FROM worker_run
       WHERE worker_name = 'witness'
       ORDER BY started_at DESC
       LIMIT 1`,
    );
    const row = wr.rows[0];
    if (row) {
      witnessRun = {
        started_at: row.started_at,
        status: row.status,
        summary:
          typeof row.summary === "string"
            ? (JSON.parse(row.summary) as Record<string, unknown>)
            : row.summary,
      };
    }
  } catch {
    // worker_run table may be missing on unmigrated envs
  }

  const workerLast = async (
    name: "compliance" | "housekeeping",
  ): Promise<{ last_run_at: string | null; status: string | null; label: string }> => {
    try {
      const r = await client.query<{ started_at: Date; status: string }>(
        `SELECT started_at, status FROM worker_run
         WHERE worker_name = $1 ORDER BY started_at DESC LIMIT 1`,
        [name],
      );
      const row = r.rows[0];
      if (!row) {
        return {
          last_run_at: null,
          status: null,
          label: name === "compliance" ? "Not scheduled yet" : "Not scheduled yet",
        };
      }
      return {
        last_run_at: row.started_at.toISOString(),
        status: row.status,
        label:
          row.status === "error"
            ? "Last run failed"
            : row.status === "ok"
              ? "Last run succeeded"
              : "Last run skipped (nothing to do)",
      };
    } catch {
      return { last_run_at: null, status: null, label: "Unknown" };
    }
  };

  const compliance = await workerLast("compliance");
  const housekeeping = await workerLast("housekeeping");

  const now = Date.now();
  const lastRunMs = witnessRun ? witnessRun.started_at.getTime() : null;
  const minutesSinceRun =
    lastRunMs != null ? Math.floor((now - lastRunMs) / 60_000) : null;

  let witnessState: ConsoleSystemStatus["witness"]["state"] = "unknown";
  let witnessLabel = "Witness status unknown";
  let witnessDetail = "Merkle witness worker has not reported yet.";

  if (witnessRun && minutesSinceRun != null) {
    if (minutesSinceRun <= 3 && witnessRun.status !== "error") {
      witnessState = "ok";
      witnessLabel = "Witness active";
      witnessDetail =
        pendingEvents === 0
          ? "Events are batched into Merkle proofs every ~60 seconds."
          : `${pendingEvents} event(s) queued for the next batch (normal if ingest just happened).`;
    } else if (minutesSinceRun <= 10) {
      witnessState = "degraded";
      witnessLabel = "Witness delayed";
      witnessDetail = `Last worker tick ${minutesSinceRun} min ago. Expected every ~60s.`;
    } else {
      witnessState = "degraded";
      witnessLabel = "Witness stale";
      witnessDetail = `No worker tick in ${minutesSinceRun} min. Check Railway aegis-witness-worker.`;
    }
    if (witnessRun.status === "error") {
      witnessState = "degraded";
      witnessLabel = "Witness error";
      witnessDetail = "Latest witness tick failed. See Platform Ops → Workers.";
    }
  } else if (merkleRootsTotal > 0 && lastBatchAt) {
    witnessState = "ok";
    witnessLabel = "Witness batches recorded";
    witnessDetail = `${merkleRootsTotal} Merkle root(s). Latest batch ${lastBatchAt.toISOString()}.`;
  }

  return {
    witness: {
      state: witnessState,
      label: witnessLabel,
      detail: witnessDetail,
      last_batch_at: lastBatchAt?.toISOString() ?? null,
      last_run_at: witnessRun?.started_at.toISOString() ?? null,
      pending_events: pendingEvents,
      merkle_roots_total: merkleRootsTotal,
    },
    workers: { compliance, housekeeping },
  };
}
