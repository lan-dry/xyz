import type pg from "pg";

export type ServiceStatus = {
  state: "inactive" | "active" | "attention";
  label: string;
  last_run_at: string | null;
};

export type ConsoleSystemStatus = {
  witness: {
    state: "ok" | "degraded" | "unknown";
    label: string;
    detail: string;
    last_batch_at: string | null;
    pending_events: number;
    merkle_roots_total: number;
  };
  services: {
    scheduled_exports: ServiceStatus;
    maintenance: ServiceStatus;
  };
};

async function serviceStatus(
  client: pg.Pool | pg.PoolClient,
  workerName: "compliance" | "housekeeping",
): Promise<ServiceStatus> {
  try {
    const r = await client.query<{ started_at: Date; status: string }>(
      `SELECT started_at, status FROM worker_run
       WHERE worker_name = $1 ORDER BY started_at DESC LIMIT 1`,
      [workerName],
    );
    const row = r.rows[0];
    if (!row) {
      return {
        state: "inactive",
        label: "Not active yet",
        last_run_at: null,
      };
    }
    if (row.status === "error") {
      return {
        state: "attention",
        label: "Needs attention",
        last_run_at: row.started_at.toISOString(),
      };
    }
    return {
      state: "active",
      label: row.status === "ok" ? "Active" : "Active (no work pending)",
      last_run_at: row.started_at.toISOString(),
    };
  } catch {
    return {
      state: "inactive",
      label: "Not active yet",
      last_run_at: null,
    };
  }
}

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

  const now = Date.now();
  const minutesSinceBatch =
    lastBatchAt != null
      ? Math.floor((now - lastBatchAt.getTime()) / 60_000)
      : null;

  let state: ConsoleSystemStatus["witness"]["state"] = "unknown";
  let label = "Ledger verification";
  let detail =
    "Signed events will appear in tamper-evident verification batches as your organization ingests activity.";

  if (merkleRootsTotal === 0 && pendingEvents === 0) {
    state = "ok";
    label = "Ledger witness ready";
    detail =
      "Your ledger is ready. Events will be batched into cryptographic proofs as workflows run.";
  } else if (pendingEvents === 0 && merkleRootsTotal > 0) {
    state = "ok";
    label = "Ledger witness OK";
    detail = "All recorded events are included in verification batches.";
  } else if (
    pendingEvents > 0 &&
    (minutesSinceBatch == null || minutesSinceBatch <= 10)
  ) {
    state = "ok";
    label = "Ledger witness OK";
    detail =
      pendingEvents === 1
        ? "1 recent event is queued for the next verification batch."
        : `${pendingEvents} recent events are queued for the next verification batch.`;
  } else if (pendingEvents > 0 && minutesSinceBatch != null && minutesSinceBatch <= 60) {
    state = "degraded";
    label = "Verification catching up";
    detail =
      "Recent activity is being processed into verification batches. Contact support if this message persists.";
  } else if (pendingEvents > 0) {
    state = "degraded";
    label = "Verification delayed";
    detail =
      "Some events are still awaiting verification batches. Contact support if this message persists.";
  } else if (merkleRootsTotal > 0) {
    state = "ok";
    label = "Ledger witness OK";
    detail = "Verification batches are recorded for your organization.";
  }

  const [scheduled_exports, maintenance] = await Promise.all([
    serviceStatus(client, "compliance"),
    serviceStatus(client, "housekeeping"),
  ]);

  return {
    witness: {
      state,
      label,
      detail,
      last_batch_at: lastBatchAt?.toISOString() ?? null,
      pending_events: pendingEvents,
      merkle_roots_total: merkleRootsTotal,
    },
    services: {
      scheduled_exports,
      maintenance,
    },
  };
}
