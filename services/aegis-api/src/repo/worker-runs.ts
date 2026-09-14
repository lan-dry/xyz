import { randomUUID } from "node:crypto";
import type pg from "pg";

export type WorkerName = "witness" | "compliance" | "housekeeping";
export type WorkerRunStatus = "ok" | "error" | "skipped";

export type WorkerRunRow = {
  run_id: string;
  worker_name: WorkerName;
  status: WorkerRunStatus;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  summary: Record<string, unknown>;
  error_message: string | null;
};

export async function insertWorkerRun(
  client: pg.Pool | pg.PoolClient,
  input: {
    workerName: WorkerName;
    status: WorkerRunStatus;
    startedAt: Date;
    finishedAt: Date;
    summary: Record<string, unknown>;
    errorMessage?: string | null;
  },
): Promise<string> {
  const runId = `wrk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const durationMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
  await client.query(
    `INSERT INTO worker_run (
       run_id, worker_name, status, started_at, finished_at, duration_ms, summary, error_message
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      runId,
      input.workerName,
      input.status,
      input.startedAt.toISOString(),
      input.finishedAt.toISOString(),
      durationMs,
      JSON.stringify(input.summary),
      input.errorMessage ?? null,
    ],
  );
  return runId;
}

export async function listWorkerRuns(
  client: pg.Pool | pg.PoolClient,
  input: { workerName?: WorkerName; limit: number; offset: number },
): Promise<{ runs: WorkerRunRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit, 1), 200);
  const offset = Math.max(input.offset, 0);
  const params: unknown[] = [];
  let where = "";
  if (input.workerName) {
    params.push(input.workerName);
    where = `WHERE worker_name = $1`;
  }

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM worker_run ${where}`,
    params,
  );
  const listParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const listResult = await client.query<WorkerRunRow>(
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
          : (row.summary as Record<string, unknown>),
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
