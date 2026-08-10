import type pg from "pg";

export type PlatformWorkerName = "witness" | "compliance" | "housekeeping";

export type PlatformWorkerRunRow = {
  run_id: string;
  worker_name: PlatformWorkerName;
  status: "ok" | "error" | "skipped";
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  summary: Record<string, unknown>;
  error_message: string | null;
};

export async function platformListWorkerRuns(
  pool: pg.Pool,
  input: { workerName?: PlatformWorkerName; limit: number; offset: number },
): Promise<{ runs: PlatformWorkerRunRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit, 1), 200);
  const offset = Math.max(input.offset, 0);
  const params: unknown[] = [];
  let where = "";
  if (input.workerName) {
    params.push(input.workerName);
    where = `WHERE worker_name = $1`;
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM worker_run ${where}`,
    params,
  );
  const listParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const listResult = await pool.query<{
    run_id: string;
    worker_name: PlatformWorkerName;
    status: "ok" | "error" | "skipped";
    started_at: Date;
    finished_at: Date | null;
    duration_ms: number | null;
    summary: Record<string, unknown> | string;
    error_message: string | null;
  }>(
    `SELECT run_id, worker_name, status, started_at, finished_at, duration_ms, summary, error_message
     FROM worker_run
     ${where}
     ORDER BY started_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams,
  );

  return {
    runs: listResult.rows.map((row) => ({
      ...row,
      summary:
        typeof row.summary === "string"
          ? (JSON.parse(row.summary) as Record<string, unknown>)
          : row.summary,
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
