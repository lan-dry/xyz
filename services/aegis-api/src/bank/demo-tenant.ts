/**
 * Hosted demo tenant (organization.is_demo). Cosmetic tag + escalation config only.
 */
import type pg from "pg";

/**
 * Held loan rules on a demo tenant escalate after 2 minutes of real elapsed time
 * (config on the rule obligations / approval metadata, never the demo clock).
 */
export const DEMO_TENANT_ESCALATION = {
  afterMs: 2 * 60_000,
  toRole: "head_of_compliance",
} as const;

/** False when the column does not exist yet (migration 018 not applied). */
export async function isOrganizationDemo(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<boolean> {
  try {
    const r = await client.query<{ is_demo: boolean }>(
      `SELECT is_demo FROM organization WHERE organization_id = $1`,
      [organizationId],
    );
    return r.rows[0]?.is_demo === true;
  } catch {
    return false;
  }
}
