/**
 * B-125: Reconcile organization_usage_monthly from event.ingested_at counts.
 * Usage: pnpm --filter billing usage:backfill [-- org_id]
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backfillOrganizationUsageMonthly } from "@salanor/platform-auth";
import { getPool } from "./db.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const organizationId = process.argv[2]?.trim() || undefined;

async function main() {
  const pool = getPool();
  const result = await backfillOrganizationUsageMonthly(pool, { organizationId });
  console.log(
    JSON.stringify(
      {
        ok: true,
        organizations_updated: result.organizations_updated,
        organization_id: organizationId ?? "all",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
