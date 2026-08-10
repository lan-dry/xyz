import type pg from "pg";
import { expireStaleApprovals } from "../repo/approvals.js";
import { getGovernanceSettings } from "../repo/governance-settings.js";

export type HousekeepingResult = {
  organization_id: string;
  expired_approvals: number;
  stale_traces_failed: number;
};

/** Expire pending approvals and fail orphaned RUNNING traces per org governance settings. */
export async function runOrganizationHousekeeping(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<HousekeepingResult> {
  const settings = await getGovernanceSettings(client, organizationId);
  const expired = await expireStaleApprovals(client, organizationId);

  const stale = await client.query<{ trace_id: string }>(
    `UPDATE trace
     SET status = 'failed', ended_at = COALESCE(ended_at, now())
     WHERE organization_id = $1
       AND status = 'running'
       AND started_at < now() - ($2::int * interval '1 hour')
     RETURNING trace_id`,
    [organizationId, String(settings.stale_trace_hours)],
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
