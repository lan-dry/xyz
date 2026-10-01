/**
 * Local only: attach pilot agent / ingest / policy to salanor-platform (same org as bootstrap).
 * Run after `pnpm db:migrate` and `pnpm db:seed:bootstrap`.
 */
import "./load-env.js";
import { assertLocalDatabaseUrl } from "./local-db-guard.js";
import { applyPilotDemoData } from "./pilot-demo-data.js";
import { closePool, getPool } from "./pool.js";

const PLATFORM_SLUG = "salanor-platform";

assertLocalDatabaseUrl();

try {
  const org = await getPool().query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1`,
    [PLATFORM_SLUG],
  );
  const organizationId = org.rows[0]?.organization_id;
  if (!organizationId) {
    console.error(`No org slug ${PLATFORM_SLUG}. Run pnpm db:migrate and pnpm db:seed:bootstrap first.`);
    process.exit(1);
  }

  await applyPilotDemoData(getPool(), organizationId, PLATFORM_SLUG);

  console.log("Local pilot fixture applied on salanor-platform:");
  console.log("  agent: agent-dev-01 · ingest: AEGIS_INGEST_DEV_KEY=aegis_dev_local_change_me");
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await closePool();
}
