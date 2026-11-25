/**
 * Seed every sandbox with the demo.banking pack so held / override / split /
 * altered test scenarios match their names (decision mode, not record-only).
 */
import type pg from "pg";
import { applyDemoPack } from "../packs/apply-pack.js";
import { loadDemoPack } from "../packs/load.js";

const PACK = "banking" as const;

export type StarterPackResult =
  | { applied: false; reason: "already_current" | "not_sandbox"; packId?: string; packVersion?: number }
  | { applied: true; packId: string; packVersion: number; policyId: string };

async function isSandbox(
  client: pg.PoolClient,
  organizationId: string,
): Promise<boolean> {
  const r = await client.query<{ tenant_kind: string }>(
    `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind
       FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return r.rows[0]?.tenant_kind === "sandbox";
}

async function currentAppliedVersion(
  client: pg.PoolClient,
  organizationId: string,
): Promise<{ id: string; version: number } | null> {
  const r = await client.query<{
    gs: { applied_pack?: { id?: string; version?: number } } | null;
  }>(
    `SELECT COALESCE(governance_settings, '{}'::jsonb) AS gs
       FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  const pack = r.rows[0]?.gs?.applied_pack;
  if (!pack?.id || typeof pack.version !== "number") return null;
  return { id: pack.id, version: pack.version };
}

/** Give sandbox admins credit_manager so the held scenario can be approved. */
export async function ensureSandboxApproverRoles(
  client: pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const members = await client.query<{ membership_id: string }>(
    `SELECT membership_id FROM membership
      WHERE organization_id = $1
        AND status = 'active'
        AND role IN ('admin', 'owner', 'approver')`,
    [organizationId],
  );
  let n = 0;
  for (const row of members.rows) {
    const ins = await client.query(
      `INSERT INTO membership_bank_role (membership_id, organization_id, role_key)
       VALUES ($1, $2, 'credit_manager')
       ON CONFLICT (membership_id, role_key) DO NOTHING`,
      [row.membership_id, organizationId],
    );
    n += ins.rowCount ?? 0;
  }
  return n;
}

/**
 * Apply demo.banking when missing or older than the bundled pack.
 * Idempotent. Caller may own a transaction.
 */
export async function ensureSandboxStarterPack(
  client: pg.PoolClient,
  organizationId: string,
  options: { force?: boolean } = {},
): Promise<StarterPackResult> {
  if (!(await isSandbox(client, organizationId))) {
    return { applied: false, reason: "not_sandbox" };
  }
  const pack = loadDemoPack(PACK);
  const current = await currentAppliedVersion(client, organizationId);
  if (
    !options.force &&
    current?.id === pack.id &&
    current.version >= pack.version
  ) {
    await ensureSandboxApproverRoles(client, organizationId);
    return {
      applied: false,
      reason: "already_current",
      packId: pack.id,
      packVersion: pack.version,
    };
  }
  const applied = await applyDemoPack(client, organizationId, PACK, {
    force: options.force === true || Boolean(current),
  });
  await ensureSandboxApproverRoles(client, organizationId);
  return {
    applied: true,
    packId: applied.packId,
    packVersion: applied.packVersion,
    policyId: applied.policyId,
  };
}
