#!/usr/bin/env node
/**
 * Upgrade check: DATABASE_URL points at a DB with older/baseline schema + sample data.
 * Runs migrateUp and prints counts for policies, receipts, events.
 *
 * Usage: pnpm exec tsx tools/scripts/upgrade-migrate-check.mts
 */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(root);

// Load env via aegis-api
await import(pathToFileURL(join(root, "services/aegis-api/src/db/load-env.js")).href);
const { migrateUp } = await import(
  pathToFileURL(join(root, "services/aegis-api/src/db/migrate.js")).href
);
const { getPool, closePool } = await import(
  pathToFileURL(join(root, "services/aegis-api/src/db/pool.js")).href
);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(2);
  }
  console.log("Running migrateUp…");
  await migrateUp();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const versions = await client.query(
      `SELECT version FROM schema_migration ORDER BY version`,
    );
    console.log(
      "migrations:",
      versions.rows.map((r: { version: string }) => r.version).join(", "),
    );
    for (const table of ["policy", "event", "forensic_receipt", "approval_delegate"]) {
      const exists = await client.query(
        `SELECT to_regclass($1) IS NOT NULL AS ok`,
        [`public.${table}`],
      );
      if (!exists.rows[0]?.ok) {
        console.log(`${table}: missing`);
        continue;
      }
      const n = await client.query(`SELECT COUNT(*)::text AS n FROM ${table}`);
      console.log(`${table}: ${n.rows[0].n}`);
    }
    console.log("PASS: upgrade migrate check completed");
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
