/**
 * Hosted demo tenant (organization.is_demo). Quiet tag + escalation config only.
 * Not AEGIS_DEMO_MODE — sales demos use a normal API and is_demo tenants.
 */
import type pg from "pg";

export const DEMO_BANK_SLUG = "demo-bank";
export const DEMO_BANK_REHEARSAL_SLUG = "demo-bank-rehearsal";

/**
 * Gate for public Demo Bank sample bundles.
 * Slug allow-list first, then organization.is_demo (never AEGIS_DEMO_MODE).
 */
export function sampleBundlesAccess(
  slug: string,
  isDemo: boolean | null | undefined,
):
  | { ok: true }
  | { ok: false; status: 403 | 404; error: "not_a_demo_org" } {
  if (slug !== DEMO_BANK_SLUG && slug !== DEMO_BANK_REHEARSAL_SLUG) {
    return { ok: false, status: 404, error: "not_a_demo_org" };
  }
  if (isDemo !== true) {
    return { ok: false, status: 403, error: "not_a_demo_org" };
  }
  return { ok: true };
}

/**
 * Held loan rules on a demo tenant escalate after 2 minutes of real elapsed time
 * (config on the rule obligations / approval metadata; system Clock only).
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
