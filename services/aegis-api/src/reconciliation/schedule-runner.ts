/**
 * Daily reconciliation schedules: feeds with schedule_enabled that have not
 * yet run today at/after their schedule_hour_utc.
 */
import type pg from "pg";
import { runReconciliation, type RunResult } from "./run.js";

export type DueFeed = {
  feed_id: string;
  organization_id: string;
  name: string;
  schedule_hour_utc: number;
  last_scheduled_at: Date | null;
};

/** Calendar day window in UTC ending at `now`. */
export function previousUtcDayRange(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  return { periodStart: start, periodEnd: end };
}

export async function listDueReconciliationFeeds(
  client: pg.Pool | pg.PoolClient,
  now: Date = new Date(),
): Promise<DueFeed[]> {
  const r = await client.query<DueFeed>(
    `SELECT feed_id, organization_id, name, schedule_hour_utc, last_scheduled_at
       FROM reconciliation_feed
      WHERE status = 'active' AND schedule_enabled = true`,
  );
  const hour = now.getUTCHours();
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return r.rows.filter((f) => {
    if (hour < f.schedule_hour_utc) return false;
    if (!f.last_scheduled_at) return true;
    return f.last_scheduled_at.getTime() < dayStart;
  });
}

export async function runDueReconciliationSchedules(
  client: pg.Pool | pg.PoolClient,
  now: Date = new Date(),
  opts?: {
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<RunResult[]> {
  const due = await listDueReconciliationFeeds(client, now);
  const { periodStart, periodEnd } = previousUtcDayRange(now);
  const results: RunResult[] = [];
  for (const feed of due) {
    const result = await runReconciliation(client, {
      organization_id: feed.organization_id,
      feed_id: feed.feed_id,
      period_start: periodStart,
      period_end: periodEnd,
      trigger: "scheduled",
      created_by: "schedule",
      signingKey: opts?.signingKey,
      now,
    });
    results.push(result);
  }
  return results;
}
