/**
 * Apply a demo policy pack's roles + matrix to an organization.
 * Usage:
 *   pnpm --filter aegis-api exec tsx src/packs/apply-pack-cli.ts --pack banking --org <uuid>
 */
import "../db/load-env.js";
import { getPool } from "../db/pool.js";
import { seedAuthorityFromPack } from "../bank/repo.js";
import { loadDemoPack, packMatrixRows, packRoles } from "./load.js";

async function main() {
  const args = process.argv.slice(2);
  const packIdx = args.indexOf("--pack");
  const orgIdx = args.indexOf("--org");
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
    await seedAuthorityFromPack(
      client,
      orgId,
      packRoles(pack),
      packMatrixRows(pack),
    );
    console.log("Done.");
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
