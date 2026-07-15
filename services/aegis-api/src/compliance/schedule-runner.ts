import type pg from "pg";
import { createComplianceExport } from "../repo/compliance-export.js";
import {
  listDueComplianceSchedules,
  markScheduleRun,
  previousCalendarMonthRange,
} from "../repo/compliance-schedule.js";
import { runComplianceExport } from "./worker.js";

export type ScheduleRunResult = {
  schedule_id: string;
  organization_id: string;
  export_id: string;
  status: string;
  integrity_hash?: string;
};

export async function runDueComplianceSchedules(
  client: pg.Pool | pg.PoolClient,
  now: Date = new Date(),
): Promise<ScheduleRunResult[]> {
  const due = await listDueComplianceSchedules(client, now);
  const results: ScheduleRunResult[] = [];

  for (const schedule of due) {
    const { periodStart, periodEnd } = previousCalendarMonthRange(now);

    const created = await createComplianceExport(client, {
      organizationId: schedule.organization_id,
      requestedBy: null,
      bundleType: schedule.bundle_type,
      periodStart,
      periodEnd,
    });

    const outcome = await runComplianceExport(client, created.export_id);
    await markScheduleRun(client, schedule.schedule_id, now);

    results.push({
      schedule_id: schedule.schedule_id,
      organization_id: schedule.organization_id,
      export_id: created.export_id,
      status: outcome.status,
      integrity_hash: outcome.integrity_hash,
    });
  }

  return results;
}
