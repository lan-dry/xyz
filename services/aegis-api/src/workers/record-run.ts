import type pg from "pg";

import {
  insertWorkerRun,
  type WorkerName,
  type WorkerRunStatus,
} from "../repo/worker-runs.js";

export async function recordWorkerRun(
  pool: pg.Pool,
  workerName: WorkerName,
  fn: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const startedAt = new Date();
  try {
    const summary = await fn();
    await insertWorkerRun(pool, {
      workerName,
      status: "ok",
      startedAt,
      finishedAt: new Date(),
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertWorkerRun(pool, {
      workerName,
      status: "error",
      startedAt,
      finishedAt: new Date(),
      summary: {},
      errorMessage: message,
    });
    throw err;
  }
}

export async function recordWorkerRunResult(
  pool: pg.Pool,
  input: {
    workerName: WorkerName;
    status: WorkerRunStatus;
    startedAt: Date;
    summary: Record<string, unknown>;
    errorMessage?: string;
  },
): Promise<void> {
  await insertWorkerRun(pool, {
    workerName: input.workerName,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: new Date(),
    summary: input.summary,
    errorMessage: input.errorMessage,
  });
}
