import { getPool } from "../db/pool.js";
import { dispatchSiemWebhook } from "./siem-dispatch.js";
import { runTenantRetention } from "./retention.js";
import { getTenantSettings } from "../tenant/settings.js";

export type ScheduledRetentionSummary = {
  tenantsConsidered: number;
  tenantsRun: number;
  results: Array<{
    tenantId: string;
    slug: string;
    skippedReason?: string;
    result?: Awaited<ReturnType<typeof runTenantRetention>>;
  }>;
};

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runScheduledRetentionForAllTenants(options?: {
  /** When set, only tenants configured for this UTC hour are eligible. */
  utcHour?: number;
  /** Bypass schedule hour / daily dedupe (manual operator run). */
  force?: boolean;
}): Promise<ScheduledRetentionSummary> {
  const pool = getPool();
  const now = new Date();
  const hour = options?.utcHour ?? now.getUTCHours();
  const force = options?.force === true;

  const tenants = await pool.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM stoa_tenant ORDER BY slug`,
  );

  const summary: ScheduledRetentionSummary = {
    tenantsConsidered: tenants.rows.length,
    tenantsRun: 0,
    results: [],
  };

  for (const row of tenants.rows) {
    const settings = await getTenantSettings(row.id);
    const retention = settings.retention;

    if (!retention.enforce) {
      summary.results.push({
        tenantId: row.id,
        slug: row.slug,
        skippedReason: "retention_not_enforced",
      });
      continue;
    }

    if (!retention.scheduleEnabled) {
      summary.results.push({
        tenantId: row.id,
        slug: row.slug,
        skippedReason: "schedule_disabled",
      });
      continue;
    }

    const scheduleHour = retention.scheduleUtcHour ?? 3;
    if (!force && scheduleHour !== hour) {
      summary.results.push({
        tenantId: row.id,
        slug: row.slug,
        skippedReason: "not_scheduled_hour",
      });
      continue;
    }

    if (!force) {
      const last = await pool.query<{ last_run_at: Date }>(
        `SELECT last_run_at FROM stoa_retention_schedule_run WHERE tenant_id = $1`,
        [row.id],
      );
      const lastAt = last.rows[0]?.last_run_at;
      if (lastAt && utcDateKey(lastAt) === utcDateKey(now)) {
        summary.results.push({
          tenantId: row.id,
          slug: row.slug,
          skippedReason: "already_ran_today",
        });
        continue;
      }
    }

    const result = await runTenantRetention(row.id, retention);
    summary.tenantsRun += 1;
    summary.results.push({ tenantId: row.id, slug: row.slug, result });

    await pool.query(
      `INSERT INTO stoa_retention_schedule_run (tenant_id, last_run_at)
       VALUES ($1, now())
       ON CONFLICT (tenant_id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`,
      [row.id],
    );

    await pool.query(
      `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
       VALUES ($1, NULL, 'retention.scheduled', $2::jsonb)`,
      [
        row.id,
        JSON.stringify({
          ...result,
          trigger: force ? "manual_all" : "schedule",
        }),
      ],
    );

    if (
      settings.compliance.siemNotifyOnRetentionRun &&
      settings.compliance.siemWebhookUrl
    ) {
      await dispatchSiemWebhook(settings.compliance, {
        type: "retention.run",
        tenantId: row.id,
        tenantSlug: row.slug,
        scheduled: !force,
        ...result,
      });
    }
  }

  return summary;
}

export function startRetentionScheduler(): () => void {
  const enabled = process.env.STOA_RETENTION_SCHEDULER === "1";
  if (!enabled) {
    return () => {};
  }
  const intervalMs = Math.max(
    60_000,
    Number(process.env.STOA_RETENTION_SCHEDULER_INTERVAL_MS) || 15 * 60_000,
  );
  let lastHour = -1;
  const timer = setInterval(() => {
    const hour = new Date().getUTCHours();
    if (hour === lastHour) {
      return;
    }
    lastHour = hour;
    void runScheduledRetentionForAllTenants({ utcHour: hour }).catch((err) => {
      console.error("[stoa-api] scheduled retention failed", err);
    });
  }, intervalMs);
  console.log(
    `[stoa-api] retention scheduler active (interval ${intervalMs}ms, UTC hour match)`,
  );
  return () => clearInterval(timer);
}
