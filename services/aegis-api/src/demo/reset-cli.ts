/**
 * Demo reset — refuses production (D5).
 * Usage: AEGIS_DEMO_MODE=true pnpm --filter aegis-api demo:reset -- --org <uuid>
 */
import "../db/load-env.js";
import { assertDemoMode, resetDemoClock } from "../bank/demo-clock.js";
import { getPool } from "../db/pool.js";

async function main() {
  assertDemoMode("demo reset");
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : process.env.AEGIS_ORGANIZATION_ID;
  if (!orgId) {
    console.error("Provide --org <organization_uuid>");
    process.exit(1);
  }

  const keepPack = args.includes("--keep-pack");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM receipt_access_log WHERE organization_id = $1`,
      [orgId],
    );
    await client.query(
      `DELETE FROM forensic_receipt WHERE organization_id = $1`,
      [orgId],
    );
    await client.query(
      `DELETE FROM forensic_checkpoint WHERE organization_id = $1`,
      [orgId],
    );
    await client.query(
      `DELETE FROM bank_case WHERE organization_id = $1`,
      [orgId],
    );
    await client.query(
      `DELETE FROM forensic_receipt_seq WHERE organization_id = $1`,
      [orgId],
    );
    if (!keepPack) {
      await client.query(
        `DELETE FROM authority_matrix WHERE organization_id = $1`,
        [orgId],
      );
      await client.query(
        `DELETE FROM membership_bank_role WHERE organization_id = $1`,
        [orgId],
      );
      await client.query(
        `DELETE FROM bank_role_ladder WHERE organization_id = $1`,
        [orgId],
      );
      await client.query(
        `DELETE FROM field_policy WHERE organization_id = $1`,
        [orgId],
      );
    }
    await client.query("COMMIT");
    resetDemoClock();
    console.log(
      `Demo reset complete for org ${orgId}${keepPack ? " (pack kept)" : ""}`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
