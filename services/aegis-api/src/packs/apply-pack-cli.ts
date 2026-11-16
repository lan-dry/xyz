/**
 * Apply a demo policy pack (roles, matrix, field policies, rules, workflow) to an org.
 * Usage:
 *   pnpm --filter aegis-api pack:apply -- --pack banking --org <uuid>
 *   pnpm --filter aegis-api pack:apply -- --pack banking --org <uuid> --seed-approvers
 * (--seed-approvers is implied when AEGIS_DEMO_MODE=true and process is non-production)
 */
import "../db/load-env.js";
import { isDemoModeAllowed } from "../bank/demo-clock.js";
import { seedDemoApprovalActors } from "../demo/seed-approval-actors.js";
import { getPool } from "../db/pool.js";
import { applyDemoPack } from "./apply-pack.js";
import { loadDemoPack } from "./load.js";

async function main() {
  const args = process.argv.slice(2);
  const packIdx = args.indexOf("--pack");
  const orgIdx = args.indexOf("--org");
  const seedActors = args.includes("--seed-approvers") || isDemoModeAllowed();
  const force = args.includes("--force");
  const packName = (packIdx >= 0 ? args[packIdx + 1] : "banking") as
    | "banking"
    | "insurance";
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : process.env.AEGIS_ORGANIZATION_ID;
  if (!orgId) {
    console.error("Provide --org <organization_uuid>");
    process.exit(1);
  }
  if (packName !== "banking" && packName !== "insurance") {
    console.error("--pack must be banking or insurance (demo packs)");
    process.exit(1);
  }
  const pack = loadDemoPack(packName);
  if (!pack.demo_only) {
    console.error("Refusing to apply non-demo pack via this CLI");
    process.exit(1);
  }
  console.log(`Applying demo pack ${pack.id} to org ${orgId} (demo_only=true)`);
  const client = await getPool().connect();
  try {
    const keys = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM signing_key
       WHERE organization_id = $1 AND COALESCE(revoked, false) = false`,
      [orgId],
    );
    const keyCount = Number(keys.rows[0]?.n ?? 0);
    const receiptKey = Boolean(
      process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
        process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim(),
    );
    if (keyCount === 0) {
      console.error(
        "ERROR: No active agent signing_key for this org. APS seals will be provisional. " +
          "Run db:local:pilot-fixture or create a signing key before a pilot demo.",
      );
      if (process.env.AEGIS_PACK_REQUIRE_SIGNING_KEY === "true") {
        process.exit(1);
      }
    } else {
      console.log(`Signing keys present: ${keyCount}`);
    }
    if (!receiptKey) {
      console.warn(
        "WARN: AEGIS_RECEIPT_SIGNING_KEY_B64 not set \u2014 forensic receipts will not be issued.",
      );
    }

    await client.query("BEGIN");
    const applied = await applyDemoPack(client, orgId, packName, { force });
    await client.query("COMMIT");
    console.log(
      `Done. Active policy ${applied.policyId} pack=${applied.packId}@v${applied.packVersion} combine=${applied.combine}` +
        (force ? " (force overwrite)" : " (insert-only for existing tenant config)"),
    );

    if (seedActors) {
      if (!isDemoModeAllowed()) {
        console.warn(
          "Skipping demo approver seed (need AEGIS_DEMO_MODE=true, non-production process)",
        );
      } else {
        const seeded = await seedDemoApprovalActors(client, orgId);
        console.log(
          `Seeded demo approvers (${seeded.emails.join(", ")}); password from AEGIS_DEMO_APPROVAL_PASSWORD only`,
        );
      }
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
