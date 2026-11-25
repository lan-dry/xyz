/**
 * POST ALERT_WEBHOOK_URL when ops signals fire. No-op with one log line
 * when the webhook is unset. Duplicate alerts are suppressed for 15 minutes.
 */
import {
  fiveXxSpikeThreshold,
  http5xxInWindow,
} from "./error-counters.js";
import type { ReadinessResult } from "./readiness.js";
import { queueLagThreshold } from "./metrics.js";

export type OpsAlertName =
  | "witness_not_ready"
  | "queue_lag"
  | "database_down"
  | "kms_error"
  | "http_5xx_spike";

const DEDUPE_MS = 15 * 60_000;

const lastSent = new Map<OpsAlertName, number>();
const loggedMissingWebhook = new Set<OpsAlertName>();

export function resetOpsAlertStateForTests(): void {
  lastSent.clear();
  loggedMissingWebhook.clear();
}

type WitnessCheck = {
  ok?: boolean;
  configured?: boolean;
  last_run_at?: string | null;
  last_run_age_minutes?: number | null;
  last_batch_at?: string | null;
  last_batch_age_minutes?: number | null;
};

type DatabaseCheck = { ok?: boolean; configured?: boolean };
type SigningCheck = {
  ok?: boolean;
  configured?: boolean;
  custody?: string | null;
  reachable?: boolean | null;
};

function checksOf(body: Record<string, unknown>): {
  witness?: WitnessCheck;
  database?: DatabaseCheck;
  signing?: SigningCheck;
  pending: number | null;
} {
  const checks = (body.checks ?? {}) as {
    witness?: WitnessCheck;
    tsa?: { pending_timestamps?: unknown };
    database?: DatabaseCheck;
    signing_key?: SigningCheck;
  };
  const pendingRaw = checks.tsa?.pending_timestamps;
  return {
    witness: checks.witness,
    database: checks.database,
    signing: checks.signing_key,
    pending: typeof pendingRaw === "number" ? pendingRaw : null,
  };
}

export function opsAlertReasons(
  body: Record<string, unknown>,
  threshold: number,
  opts: { fiveXxCount?: number; fiveXxThreshold?: number } = {},
): OpsAlertName[] {
  const { witness, pending, database, signing } = checksOf(body);
  const reasons: OpsAlertName[] = [];
  if (database && database.configured !== false && database.ok === false) {
    reasons.push("database_down");
  }
  // Early readiness body when DB is down may only set reason, not checks.database.
  if (
    !reasons.includes("database_down") &&
    (body.reason === "database_unavailable" || body.database === "down")
  ) {
    reasons.push("database_down");
  }
  if (
    signing &&
    signing.configured === true &&
    signing.custody === "kms" &&
    signing.ok === false
  ) {
    reasons.push("kms_error");
  }
  if (witness && witness.configured !== false && witness.ok === false) {
    reasons.push("witness_not_ready");
  }
  if (pending != null && pending > threshold) {
    reasons.push("queue_lag");
  }
  const fiveXx = opts.fiveXxCount ?? 0;
  const fiveXxLimit = opts.fiveXxThreshold ?? 25;
  if (fiveXx > fiveXxLimit) {
    reasons.push("http_5xx_spike");
  }
  return reasons;
}

export async function maybeNotifyOpsAlerts(
  readiness: ReadinessResult,
  deps: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    now?: () => number;
    log?: (message: string) => void;
  } = {},
): Promise<{ sent: OpsAlertName[] }> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const threshold = queueLagThreshold(env);
  const fiveXxThreshold = fiveXxSpikeThreshold(env);
  const fiveXxCount = http5xxInWindow(now());
  const reasons = opsAlertReasons(readiness.body, threshold, {
    fiveXxCount,
    fiveXxThreshold,
  });
  const webhook = env.ALERT_WEBHOOK_URL?.trim() ?? "";
  const { witness, pending, database, signing } = checksOf(readiness.body);
  const sent: OpsAlertName[] = [];

  for (const reason of reasons) {
    if (!webhook) {
      if (!loggedMissingWebhook.has(reason)) {
        loggedMissingWebhook.add(reason);
        log(`[ops-alert] ALERT_WEBHOOK_URL is not set; not sending ${reason}`);
      }
      continue;
    }
    const previous = lastSent.get(reason) ?? 0;
    if (now() - previous < DEDUPE_MS) continue;

    const payload = {
      service: "aegis-api",
      alert: reason,
      at: new Date(now()).toISOString(),
      database: database
        ? { ok: database.ok === true, configured: database.configured !== false }
        : null,
      signing_key: signing
        ? {
            ok: signing.ok === true,
            custody: signing.custody ?? null,
            reachable: signing.reachable ?? null,
          }
        : null,
      witness: witness
        ? {
            ok: witness.ok === true,
            last_run_age_minutes: witness.last_run_age_minutes ?? null,
            last_batch_age_minutes: witness.last_batch_age_minutes ?? null,
          }
        : null,
      queue: {
        pending_timestamps: pending,
        lag_threshold: threshold,
      },
      http_5xx: {
        window_count: fiveXxCount,
        spike_threshold: fiveXxThreshold,
      },
    };
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      log(`[ops-alert] webhook returned ${response.status} for ${reason}`);
      continue;
    }
    lastSent.set(reason, now());
    sent.push(reason);
  }

  return { sent };
}
