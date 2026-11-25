/**
 * Per-tenant ingest and export limits.
 * IP ingest limits stay on the route. These run after auth resolves organizationId.
 * Monthly plan meters stay soft (assertIngestWithinLimits). Sandbox daily and
 * storage quotas are a hard refuse.
 */
import type pg from "pg";
import {
  checkRateLimit,
  exportRateLimitKey,
  orgIngestRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { isSandboxOrg } from "../tenants/tenant-kind.js";

const ORG_SQL = `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind,
            COALESCE(is_test, false) AS is_test,
            event_quota_daily,
            storage_quota_mb
       FROM organization
      WHERE organization_id = $1`;

const USAGE_SQL = `SELECT
       (
         (SELECT COUNT(*) FROM event
           WHERE organization_id = $1
             AND ingested_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
         +
         (SELECT COUNT(*) FROM collector_cdc_event
           WHERE organization_id = $1
             AND ingested_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
       )::text AS events_today,
       (
         COALESCE((SELECT SUM(pg_column_size(e)) FROM event e WHERE e.organization_id = $1), 0)
         +
         COALESCE((SELECT SUM(pg_column_size(c)) FROM collector_cdc_event c WHERE c.organization_id = $1), 0)
       )::text AS storage_bytes`;

const USAGE_EVENT_ONLY_SQL = `SELECT
       (SELECT COUNT(*) FROM event
         WHERE organization_id = $1
           AND ingested_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
       )::text AS events_today,
       COALESCE((SELECT SUM(pg_column_size(e)) FROM event e WHERE e.organization_id = $1), 0)::text
         AS storage_bytes`;

type OrgQuotaRow = {
  tenant_kind: string;
  is_test: boolean;
  event_quota_daily: number | string | null;
  storage_quota_mb: number | string | null;
};

type UsageRow = {
  events_today: string | number | null;
  storage_bytes: string | number | null;
};

function asFinite(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function pgCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code ?? "")
    : undefined;
}

/** Per-org ingest ceiling (events per minute). Independent of the IP limit. */
export function refuseOrgIngestRateLimit(organizationId: string): Response | null {
  const limit = readRateLimitEnv("INGEST_ORG_RATE_LIMIT_PER_MIN", 300);
  const rl = checkRateLimit(orgIngestRateLimitKey(organizationId), {
    limit,
    windowMs: 60_000,
  });
  return rl.ok ? null : rateLimitResponse(rl.retryAfterSec);
}

/** Console export create/download ceiling. Default 60 per hour. */
export function refuseExportRateLimit(organizationId: string): Response | null {
  const limit = readRateLimitEnv("EXPORT_RATE_LIMIT_PER_HOUR", 60);
  const rl = checkRateLimit(exportRateLimitKey(organizationId), {
    limit,
    windowMs: 60 * 60_000,
  });
  return rl.ok ? null : rateLimitResponse(rl.retryAfterSec);
}

function quotaBody(
  code: string,
  message: string,
  extra: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: code, code, message, ...extra }), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadUsage(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<UsageRow | undefined> {
  try {
    const result = await client.query<UsageRow>(USAGE_SQL, [organizationId]);
    return result.rows[0];
  } catch (err) {
    // collector_cdc_event is newer than event; count the event table alone.
    if (pgCode(err) !== "42P01") throw err;
    const result = await client.query<UsageRow>(USAGE_EVENT_ONLY_SQL, [organizationId]);
    return result.rows[0];
  }
}

/**
 * Hard-stop sandbox tenants over event_quota_daily or storage_quota_mb.
 * Real tenants are unchanged (monthly meters stay soft).
 * Missing quota columns (migration not applied) do not block ingest.
 */
export async function enforceSandboxQuota(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<Response | null> {
  let row: OrgQuotaRow | undefined;
  try {
    const org = await client.query<OrgQuotaRow>(ORG_SQL, [organizationId]);
    row = org.rows[0];
  } catch (err) {
    if (pgCode(err) === "42703") return null;
    throw err;
  }
  if (!row || !isSandboxOrg(row)) return null;

  const daily = asFinite(row.event_quota_daily);
  const storageMb = asFinite(row.storage_quota_mb);
  if (daily == null && storageMb == null) return null;

  const usage = await loadUsage(client, organizationId);
  const eventsToday = asFinite(usage?.events_today) ?? 0;
  const storageBytes = asFinite(usage?.storage_bytes) ?? 0;

  if (daily != null && eventsToday >= daily) {
    return quotaBody(
      "sandbox_event_quota",
      `Sandbox daily event quota reached (${eventsToday}/${daily}). Ingest is refused until the next UTC day.`,
      { events_today: eventsToday, event_quota_daily: daily },
    );
  }

  if (storageMb != null && storageBytes >= storageMb * 1024 * 1024) {
    const usedMb = Math.ceil(storageBytes / (1024 * 1024));
    return quotaBody(
      "sandbox_storage_quota",
      `Sandbox storage quota reached (${usedMb} MB of ${storageMb} MB). Ingest is refused until stored data is under the quota.`,
      { storage_mb: usedMb, storage_quota_mb: storageMb },
    );
  }

  return null;
}

export async function enforceOrgIngestControls(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  options?: { enforceQuota?: boolean },
): Promise<Response | null> {
  const limited = refuseOrgIngestRateLimit(organizationId);
  if (limited) return limited;
  if (options?.enforceQuota === false) return null;
  return enforceSandboxQuota(client, organizationId);
}
