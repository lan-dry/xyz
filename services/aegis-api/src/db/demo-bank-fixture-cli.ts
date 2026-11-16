/**
 * Ensure the Demo Bank organisation (or its rehearsal scratch twin).
 * Local Docker/demo Postgres only; requires AEGIS_DEMO_MODE=true.
 *
 *   pnpm --filter aegis-api db:demo-bank-fixture
 *   pnpm --filter aegis-api db:demo-bank-fixture -- --rehearsal
 *   pnpm --filter aegis-api db:demo-bank-fixture -- --slug demo-bank --name "Demo Bank"
 *
 * Prints a machine-readable `DEMO_ORG_ID=<uuid>` line for tools/demo scripts.
 */
import "./load-env.js";
import { assertLocalDatabaseUrl } from "./local-db-guard.js";
import {
  DEMO_BANK_REHEARSAL_SLUG,
  ensureDemoBankOrganization,
} from "./demo-bank-fixture.js";
import { closePool, getPool } from "./pool.js";

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

assertLocalDatabaseUrl();

const args = process.argv.slice(2);
const slug = args.includes("--rehearsal")
  ? DEMO_BANK_REHEARSAL_SLUG
  : argValue(args, "--slug");
const name = argValue(args, "--name");

const client = await getPool().connect();
try {
  await client.query("BEGIN");
  const result = await ensureDemoBankOrganization(client, { slug, name });
  await client.query("COMMIT");
  console.log(`Demo Bank fixture applied: ${result.name} (${result.slug})`);
  console.log(`  admin: ${result.adminEmail} (password from AEGIS_DEMO_APPROVAL_PASSWORD)`);
  console.log(`  agents: ${result.agentIds.join(", ")}`);
  console.log(`  ingest key prefix: ${result.ingestKeyPrefix}…`);
  console.log(`DEMO_ORG_ID=${result.organizationId}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await closePool();
}
