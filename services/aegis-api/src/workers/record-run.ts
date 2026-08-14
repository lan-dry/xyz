import type pg from "pg";

import {
  insertWorkerRun,
  type WorkerName,
  type WorkerRunStatus,
} from "../repo/worker-runs.js";

function isMissingWorkerRunTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "42P01";
}

export async function recordWorkerRun(
  pool: pg.Pool,
  workerName: WorkerName,
  fn: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const startedAt = new Date();
  try {
    const summary = await fn();
    try {
      await insertWorkerRun(pool, {
        workerName,
        status: "ok",
        startedAt,
        finishedAt: new Date(),
        summary,
      });
    } catch (err) {
      if (isMissingWorkerRunTable(err)) {
        console.warn(
          "[worker-run] worker_run table missing; run pnpm --filter aegis-api db:migrate",
        );
        return;
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await insertWorkerRun(pool, {
        workerName,
        status: "error",
        startedAt,
        finishedAt: new Date(),
        summary: {},
        errorMessage: message,
      });
    } catch (logErr) {
      if (!isMissingWorkerRunTable(logErr)) {
        console.error("[worker-run] failed to record error run:", logErr);
      }
    }
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
  try {
    await insertWorkerRun(pool, {
      workerName: input.workerName,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: new Date(),
      summary: input.summary,
      errorMessage: input.errorMessage,
    });
  } catch (err) {
    if (isMissingWorkerRunTable(err)) {
      console.warn(
        "[worker-run] worker_run table missing; run pnpm --filter aegis-api db:migrate",
      );
      return;
    }
    throw err;
  }
}
