/**
 * GET /metrics and GET /v1/ops/status.
 * Same signals as /ready, plus in-process error counts and queue lag.
 * Always HTTP 200 so a scraper can read a not-ready instance. /ready stays the probe.
 */
import { apiErrorCounters } from "./error-counters.js";
import {
  buildReadiness,
  type ReadinessDeps,
  type ReadinessResult,
} from "./readiness.js";

type Env = Record<string, string | undefined>;

const DEFAULT_QUEUE_LAG = 500;

export function queueLagThreshold(env: Env = process.env): number {
  const raw = env.ALERT_QUEUE_LAG_THRESHOLD;
  if (!raw) return DEFAULT_QUEUE_LAG;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_QUEUE_LAG;
}

export function metricsFromReadiness(
  readiness: ReadinessResult,
  errors: ReturnType<typeof apiErrorCounters>,
  threshold: number,
): Record<string, unknown> {
  const checks = (readiness.body.checks ?? {}) as {
    database?: unknown;
    witness?: Record<string, unknown>;
    tsa?: { pending_timestamps?: unknown };
  };
  const witness = checks.witness ?? null;
  const pendingRaw = checks.tsa?.pending_timestamps;
  const pending = typeof pendingRaw === "number" ? pendingRaw : null;
  return {
    service: "aegis-api",
    status: readiness.body.status ?? "unknown",
    errors,
    auth: "ops_token_required",
    database: checks.database ?? null,
    witness: witness
      ? {
          ok: witness.ok ?? null,
          configured: witness.configured ?? null,
          last_run_at: witness.last_run_at ?? null,
          last_run_age_minutes: witness.last_run_age_minutes ?? null,
          last_batch_at: witness.last_batch_at ?? null,
          last_batch_age_minutes: witness.last_batch_age_minutes ?? null,
        }
      : null,
    queue: {
      pending_timestamps: pending,
      lag_threshold: threshold,
      lag_exceeded: pending != null && pending > threshold,
    },
    workers: readiness.body.workers ?? [],
  };
}

export async function collectMetrics(
  deps: ReadinessDeps = {},
): Promise<{ readiness: ReadinessResult; body: Record<string, unknown> }> {
  const readiness = await buildReadiness(deps);
  return {
    readiness,
    body: metricsFromReadiness(
      readiness,
      apiErrorCounters(),
      queueLagThreshold(deps.env),
    ),
  };
}
