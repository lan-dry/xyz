import { randomUUID } from "node:crypto";
import type pg from "pg";

export type ComplianceScheduleRow = {
  schedule_id: string;
  organization_id: string;
  bundle_type: string;
  cadence: string;
  enabled: boolean;
  day_of_month: number;
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function computeNextMonthlyRun(
  dayOfMonth: number,
  from: Date = new Date(),
): Date {
  const day = Math.min(Math.max(dayOfMonth, 1), 28);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const date = from.getUTCDate();

  let targetMonth = month;
  let targetYear = year;
  if (date >= day) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  return new Date(Date.UTC(targetYear, targetMonth, day, 6, 0, 0, 0));
}

/** Previous calendar month [start, end] in UTC. */
export function previousCalendarMonthRange(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

export async function getComplianceSchedule(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<ComplianceScheduleRow | null> {
  const result = await client.query<ComplianceScheduleRow>(
    `SELECT * FROM compliance_export_schedule WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows[0] ?? null;
}

export async function upsertComplianceSchedule(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    bundleType: string;
    enabled: boolean;
    dayOfMonth: number;
  },
): Promise<ComplianceScheduleRow> {
  const day = Math.min(Math.max(input.dayOfMonth, 1), 28);
  const existing = await getComplianceSchedule(client, input.organizationId);
  const nextRunAt = input.enabled
    ? computeNextMonthlyRun(day)
    : null;

  if (existing) {
    const result = await client.query<ComplianceScheduleRow>(
      `UPDATE compliance_export_schedule
       SET bundle_type = $2,
           enabled = $3,
           day_of_month = $4,
           next_run_at = CASE WHEN $3 THEN COALESCE(next_run_at, $5) ELSE NULL END,
           updated_at = now()
       WHERE organization_id = $1
       RETURNING *`,
      [input.organizationId, input.bundleType, input.enabled, day, nextRunAt],
    );
    return result.rows[0]!;
  }

  const scheduleId = `sch_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await client.query<ComplianceScheduleRow>(
    `INSERT INTO compliance_export_schedule (
       schedule_id, organization_id, bundle_type, cadence, enabled,
       day_of_month, next_run_at
     ) VALUES ($1, $2, $3, 'monthly', $4, $5, $6)
     RETURNING *`,
    [
      scheduleId,
      input.organizationId,
      input.bundleType,
      input.enabled,
      day,
      nextRunAt,
    ],
  );
  return result.rows[0]!;
}

export async function listDueComplianceSchedules(
  client: pg.Pool | pg.PoolClient,
  now: Date = new Date(),
): Promise<ComplianceScheduleRow[]> {
  const result = await client.query<ComplianceScheduleRow>(
    `SELECT * FROM compliance_export_schedule
     WHERE enabled = true
       AND next_run_at IS NOT NULL
       AND next_run_at <= $1
     ORDER BY next_run_at ASC`,
    [now],
  );
  return result.rows;
}

export async function markScheduleRun(
  client: pg.Pool | pg.PoolClient,
  scheduleId: string,
  ranAt: Date,
): Promise<void> {
  const row = await client.query<{ day_of_month: number }>(
    `SELECT day_of_month FROM compliance_export_schedule WHERE schedule_id = $1`,
    [scheduleId],
  );
  const day = row.rows[0]?.day_of_month ?? 1;
  const nextRunAt = computeNextMonthlyRun(day, ranAt);

  await client.query(
    `UPDATE compliance_export_schedule
     SET last_run_at = $2,
         next_run_at = $3,
         updated_at = now()
     WHERE schedule_id = $1`,
    [scheduleId, ranAt, nextRunAt],
  );
}
