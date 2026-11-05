/**
 * Delete one organization's cases (traces, events, approvals, share links).
 * Leaves the org, agents, keys, and policies in place.
 *
 * Usage:
 *   pnpm demo:clear-cases -- northwind-payments
 *   pnpm demo:clear-cases -- --production salanor-platform
 *
 * Without --production this uses DATABASE_URL (local).
 * With --production it uses DATABASE_URL_UNPOOLED from the repo .env.
 */
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { loadEnvFile } from "./load-env.mts";

loadEnvFile();

const production = process.argv.includes("--production");
const slug = process.argv.slice(2).find((arg) => !arg.startsWith("--"))?.trim();
if (!slug) {
  console.error("Usage: pnpm demo:clear-cases -- [--production] <organization-slug>");
  process.exit(1);
}

function stripQuotes(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const dbUrl = stripQuotes(
  production ? process.env.DATABASE_URL_UNPOOLED : process.env.DATABASE_URL,
);
if (!dbUrl) {
  console.error(
    production ? "DATABASE_URL_UNPOOLED missing in .env" : "DATABASE_URL missing in .env",
  );
  process.exit(1);
}

let host = "unknown";
try {
  host = new URL(dbUrl).hostname;
} catch {
  console.error("Database URL in .env is not valid. Check the quotes around it.");
  process.exit(1);
}
console.log(production ? `Production database ${host}` : `Local database ${host}`);

const pool = new pg.Pool({
  connectionString: normalizePostgresDatabaseUrl(dbUrl),
});

const client = await pool.connect();
try {
  const org = await client.query<{ organization_id: string; name: string; slug: string }>(
    `SELECT organization_id, name, slug FROM organization WHERE slug = $1`,
    [slug],
  );
  const row = org.rows[0];
  if (!row) {
    const known = await client.query<{ slug: string }>(
      `SELECT slug FROM organization ORDER BY slug`,
    );
    const slugs = known.rows.map((item) => item.slug).join(", ") || "(none)";
    console.error(`No organization with slug ${slug}. On this database: ${slugs}`);
    process.exit(1);
  }

  await client.query("BEGIN");
  const orgId = row.organization_id;
  await client.query(`DELETE FROM approval_vote WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM approval WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM inclusion_proof WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM transparency_log_entry WHERE organization_id = $1`, [orgId]);
  await client.query(`UPDATE artifact SET event_id = NULL WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM receipt_share_token WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM idempotency_record WHERE organization_id = $1`, [orgId]);
  await client.query(
    `UPDATE incident SET trace_id = NULL, event_id = NULL WHERE organization_id = $1`,
    [orgId],
  );
  await client.query(
    `UPDATE event SET parent_event_id = NULL, span_id = NULL WHERE organization_id = $1`,
    [orgId],
  );
  const events = await client.query(`DELETE FROM event WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM span WHERE organization_id = $1`, [orgId]);
  const traces = await client.query(`DELETE FROM trace WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM workflow_run WHERE organization_id = $1`, [orgId]);
  await client.query("COMMIT");

  console.log(`Cleared ${row.name} (${row.slug})`);
  console.log(`  events ${events.rowCount ?? 0}`);
  console.log(`  traces ${traces.rowCount ?? 0}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
