/**
 * Delete one organization's cases (traces, events, approvals, share links).
 * Leaves the org, agents, keys, and policies in place.
 *
 * Usage: pnpm demo:clear-cases -- northwind-payments
 * Uses DATABASE_URL from the repo .env. That is the local database unless you override it.
 */
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { loadEnvFile } from "./load-env.mts";

loadEnvFile();

const slug = process.argv.slice(2).find((arg) => !arg.startsWith("--"))?.trim();
if (!slug) {
  console.error("Usage: pnpm demo:clear-cases -- <organization-slug>");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("DATABASE_URL missing in .env");
  process.exit(1);
}

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
    console.error(`No organization with slug ${slug}`);
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
