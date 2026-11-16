/**
 * GET /ready: is this instance able to do its job?
 *
 * Reports (additively; existing `status`, `database`, `workers` fields are kept):
 *   checks.database     reachable
 *   checks.witness      witness worker heartbeat + last Merkle batch age (or "not configured")
 *   checks.tsa          trusted-time authority reachability + queued stamps
 *   checks.signing_key  receipt signing key custody and (KMS) reachability
 *
 * 503 when the database is down, a required worker is stale, or the signing key
 * is required but unreachable. An unreachable TSA is reported as a warning only:
 * receipts are still issued and stamped later.
 *
 * Probes of external services are cached so a busy /ready cannot flood the TSA
 * or CloudTrail. Output is deliberately free of ARNs, URLs with credentials and
 * raw error text.
 */
import { isProductionEnv } from "../boot/production-env.js";
import { getReceiptKmsSigner, isReceiptKmsConfigured } from "../crypto/kms-ed25519.js";
import {
  configuredCustody,
  isReceiptSigningConfigured,
  receiptKeyIdFromEnv,
} from "../crypto/receipt-signing.js";
import { getPool, pingDatabase } from "../db/pool.js";
import { countPendingTimestamps } from "../forensic/receipt-timestamp.js";
import { getTsaConfig } from "../forensic/tsa.js";

type Env = Record<string, string | undefined>;

export type ReadinessWorker = {
  name: string;
  ready: boolean;
  status: string;
  last_run_at: string | null;
  age_minutes: number | null;
  max_age_minutes: number;
};

export type ReadinessDeps = {
  env?: Env;
  now?: () => number;
  pingDatabase?: () => Promise<{ ok: boolean }>;
  /** Latest run per worker name. */
  queryWorkers?: (names: string[]) => Promise<
    Array<{ worker_name: string; status: string; started_at: Date }>
  >;
  /** Newest Merkle batch end time, or null when there is none. */
  queryLastBatchAt?: () => Promise<Date | null>;
  queryPendingTimestamps?: () => Promise<number>;
  /** Reachability probe for the TSA URL (any HTTP answer counts). */
  probeTsa?: (url: string) => Promise<boolean>;
  /** KMS GetPublicKey probe. */
  probeKms?: () => Promise<boolean>;
};

const TSA_PROBE_TTL_MS = 60_000;
const KMS_OK_TTL_MS = 300_000;
const KMS_FAIL_TTL_MS = 15_000;

const tsaCache = new Map<string, { at: number; reachable: boolean }>();
let kmsCache: { at: number; ok: boolean } | null = null;

export function resetReadinessCachesForTests(): void {
  tsaCache.clear();
  kmsCache = null;
}

async function defaultProbeTsa(url: string): Promise<boolean> {
  try {
    // Any HTTP answer (even 405 for GET) proves DNS, network and the server are up.
    await fetch(url, { method: "GET", signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    return false;
  }
}

async function defaultProbeKms(): Promise<boolean> {
  const signer = getReceiptKmsSigner();
  if (!signer) return false;
  try {
    await signer.getPublicKey();
    return true;
  } catch {
    return false;
  }
}

export type ReadinessResult = { httpStatus: 200 | 503; body: Record<string, unknown> };

export async function buildReadiness(
  deps: ReadinessDeps = {},
): Promise<ReadinessResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const production = isProductionEnv(env);

  // --- database
  const db = env.DATABASE_URL
    ? await (deps.pingDatabase ?? pingDatabase)()
    : null;
  const databaseCheck = {
    configured: Boolean(env.DATABASE_URL),
    ok: db?.ok === true,
  };

  // --- signing key (independent of the database)
  const signing = await signingKeyCheck(env, now, deps, production);

  if (!db?.ok) {
    return {
      httpStatus: 503,
      body: {
        status: "not_ready",
        service: "aegis-api",
        reason: db === null ? "database_not_configured" : "database_unavailable",
        checks: { database: databaseCheck, signing_key: signing },
      },
    };
  }

  const requiredWorkers = (env.AEGIS_REQUIRED_WORKERS ?? "witness,housekeeping,compliance")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const maxAgeMinutes: Record<string, number> = {
    witness: Number(env.AEGIS_WITNESS_MAX_AGE_MINUTES ?? "10"),
    housekeeping: Number(env.AEGIS_HOUSEKEEPING_MAX_AGE_MINUTES ?? "1560"),
    compliance: Number(env.AEGIS_COMPLIANCE_MAX_AGE_MINUTES ?? "1560"),
  };

  let workers: ReadinessWorker[];
  let witnessRunAt: Date | null = null;
  let lastBatchAt: Date | null = null;
  let pendingStamps: number | null = null;
  try {
    const queryWorkers =
      deps.queryWorkers ??
      (async (names: string[]) => {
        const runs = await getPool().query<{
          worker_name: string;
          status: string;
          started_at: Date;
        }>(
          `SELECT DISTINCT ON (worker_name) worker_name, status, started_at
           FROM worker_run
           WHERE worker_name = ANY($1::text[])
           ORDER BY worker_name, started_at DESC`,
          [names],
        );
        return runs.rows;
      });
    const names = [...new Set([...requiredWorkers, "witness"])];
    const rows = await queryWorkers(names);
    const byName = new Map(rows.map((row) => [row.worker_name, row]));
    const nowMs = now();
    workers = requiredWorkers.map((name) => {
      const row = byName.get(name);
      const ageMinutes = row
        ? Math.max(0, Math.floor((nowMs - row.started_at.getTime()) / 60_000))
        : null;
      const limit = maxAgeMinutes[name] ?? 60;
      const ready =
        row != null &&
        row.status !== "error" &&
        ageMinutes != null &&
        ageMinutes <= limit;
      return {
        name,
        ready,
        status: row?.status ?? "missing",
        last_run_at: row?.started_at.toISOString() ?? null,
        age_minutes: ageMinutes,
        max_age_minutes: limit,
      };
    });
    witnessRunAt = byName.get("witness")?.started_at ?? null;
  } catch {
    return {
      httpStatus: 503,
      body: {
        status: "not_ready",
        service: "aegis-api",
        database: "up",
        reason: "worker_status_unavailable",
        checks: { database: databaseCheck, signing_key: signing },
      },
    };
  }

  try {
    lastBatchAt = await (deps.queryLastBatchAt ??
      (async () => {
        const r = await getPool().query<{ last: Date | null }>(
          `SELECT max(interval_end) AS last FROM merkle_root`,
        );
        return r.rows[0]?.last ?? null;
      }))();
  } catch {
    lastBatchAt = null;
  }

  const witnessMax = maxAgeMinutes.witness ?? 10;
  const witnessConfigured =
    requiredWorkers.includes("witness") || witnessRunAt !== null;
  const witnessAge = (at: Date | null) =>
    at ? Math.max(0, Math.floor((now() - at.getTime()) / 60_000)) : null;
  const witnessHeartbeatAge = witnessAge(witnessRunAt);
  const witness = {
    configured: witnessConfigured,
    last_run_at: witnessRunAt?.toISOString() ?? null,
    last_run_age_minutes: witnessHeartbeatAge,
    last_batch_at: lastBatchAt?.toISOString() ?? null,
    last_batch_age_minutes: witnessAge(lastBatchAt),
    max_age_minutes: witnessMax,
    // The worker heartbeat is what proves the witness is alive: a quiet system
    // makes no batch, so batch age alone would flap.
    ok: !witnessConfigured
      ? true
      : witnessHeartbeatAge !== null && witnessHeartbeatAge <= witnessMax,
  };

  // --- trusted time (TSA)
  const tsaConfig = getTsaConfig(env);
  let tsa: Record<string, unknown>;
  if (!tsaConfig) {
    tsa = { configured: false, reachable: null, ok: true };
  } else {
    const cached = tsaCache.get(tsaConfig.url);
    let reachable: boolean;
    if (cached && now() - cached.at < TSA_PROBE_TTL_MS) {
      reachable = cached.reachable;
    } else {
      reachable = await (deps.probeTsa ?? defaultProbeTsa)(tsaConfig.url);
      tsaCache.set(tsaConfig.url, { at: now(), reachable });
    }
    try {
      pendingStamps = await (deps.queryPendingTimestamps ??
        (() => countPendingTimestamps(getPool())))();
    } catch {
      pendingStamps = null;
    }
    tsa = {
      configured: true,
      authority: tsaConfig.authority,
      reachable,
      pending_timestamps: pendingStamps,
      // Receipts are issued without the stamp, so this never blocks readiness.
      ok: true,
    };
  }

  const warnings: string[] = [];
  if (tsa.configured === true && tsa.reachable === false) warnings.push("tsa_unreachable");
  if (signing.custody === "software_interim") warnings.push("software_key_interim");

  const ready =
    workers.every((worker) => worker.ready) && signing.ok === true;
  return {
    httpStatus: ready ? 200 : 503,
    body: {
      status: ready ? "ready" : "not_ready",
      service: "aegis-api",
      database: "up",
      workers,
      checks: {
        database: databaseCheck,
        witness,
        tsa,
        signing_key: signing,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

async function signingKeyCheck(
  env: Env,
  now: () => number,
  deps: ReadinessDeps,
  production: boolean,
): Promise<{
  configured: boolean;
  custody: "kms" | "software_interim" | "software" | null;
  key_id: string | null;
  reachable: boolean | null;
  ok: boolean;
}> {
  if (!isReceiptSigningConfigured(env as NodeJS.ProcessEnv)) {
    // Nothing configured is fine for local dev, never for production.
    return {
      configured: false,
      custody: null,
      key_id: null,
      reachable: null,
      ok: !production,
    };
  }
  const custody = configuredCustody(env as NodeJS.ProcessEnv);
  const keyId = receiptKeyIdFromEnv(env as NodeJS.ProcessEnv);
  if (!isReceiptKmsConfigured(env as NodeJS.ProcessEnv)) {
    return { configured: true, custody, key_id: keyId, reachable: true, ok: true };
  }
  let ok: boolean;
  if (
    kmsCache &&
    now() - kmsCache.at < (kmsCache.ok ? KMS_OK_TTL_MS : KMS_FAIL_TTL_MS)
  ) {
    ok = kmsCache.ok;
  } else {
    ok = await (deps.probeKms ?? defaultProbeKms)();
    kmsCache = { at: now(), ok };
  }
  return { configured: true, custody, key_id: keyId, reachable: ok, ok };
}
