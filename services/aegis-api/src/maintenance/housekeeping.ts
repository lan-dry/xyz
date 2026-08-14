import type pg from "pg";
import { expireStaleApprovals } from "../repo/approvals.js";
import { getGovernanceSettings } from "../repo/governance-settings.js";

export type HousekeepingResult = {
  organization_id: string;
  expired_approvals: number;
  stale_traces_failed: number;
};

/** Expire pending approvals and fail orphaned open traces per org governance settings. */
export async function runOrganizationHousekeeping(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<HousekeepingResult> {
  const settings = await getGovernanceSettings(client, organizationId);
  const expired = await expireStaleApprovals(client, organizationId);

  const staleHours = String(settings.stale_trace_hours);
  const stale = await client.query<{ trace_id: string }>(
    `UPDATE trace
     SET status = 'failed', ended_at = COALESCE(ended_at, now())
     WHERE organization_id = $1
       AND status IN ('running', 'blocked', 'executing')
       AND started_at < now() - ($2::int * interval '1 hour')
       AND (
         status IN ('running', 'executing')
         OR NOT EXISTS (
           SELECT 1 FROM approval a
           JOIN event e ON e.event_id = a.event_id AND e.organization_id = a.organization_id
           WHERE e.trace_id = trace.trace_id
             AND a.organization_id = $1
             AND a.status = 'pending'
             AND (a.expires_at IS NULL OR a.expires_at > now())
         )
       )
     RETURNING trace_id`,
    [organizationId, staleHours],
  );

  return {
    organization_id: organizationId,
    expired_approvals: expired,
    stale_traces_failed: stale.rowCount ?? 0,
  };
}

export async function runGlobalHousekeeping(
  client: pg.Pool | pg.PoolClient,
): Promise<HousekeepingResult[]> {
  const orgs = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE active = true`,
  );
  const results: HousekeepingResult[] = [];
  for (const org of orgs.rows) {
    results.push(await runOrganizationHousekeeping(client, org.organization_id));
  }
  return results;
}
