/**
 * Wipe demo case data for one org. Demo-only: callers must have passed
 * assertDemoMode(). Append-only triggers refuse DELETE, so this session runs
 * with session_replication_role = replica (same pattern as demo:reset).
 */
import type pg from "pg";
import { resetDemoClock } from "../bank/demo-clock.js";

export async function resetDemoOrganization(
  client: pg.PoolClient,
  orgId: string,
  opts: { keepPack?: boolean } = {},
): Promise<void> {
  const keepPack = opts.keepPack ?? false;
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL session_replication_role = replica`);
    const wipe = [
      "receipt_access_log",
      "forensic_receipt_timestamp",
      "forensic_receipt",
      "forensic_checkpoint",
      "bank_case",
      "forensic_receipt_seq",
      "approval",
      "event",
    ];
    if (!keepPack) {
      wipe.push(
        "authority_matrix",
        "membership_bank_role",
        "bank_role_ladder",
        "field_policy",
      );
    }
    for (const table of wipe) {
      await client.query(`DELETE FROM ${table} WHERE organization_id = $1`, [orgId]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  resetDemoClock();
}
