/**
 * Migration 012: rename *_update_guard / *_match_guard triggers so
 * platform_wipe_tenant can disable append-only guards on is_demo / is_test only.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { randomUUID } from "node:crypto";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const here = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(
  here,
  "../migrations/012_wipe_disable_update_guards.sql",
);

describe("migration 012 text", () => {
  it("renames decision_token / reconciliation_exception / collector_cdc guards", () => {
    const text = readFileSync(SQL_PATH, "utf8");
    expect(text).toContain("trg_decision_token_update_guard");
    expect(text).toContain("trg_decision_token_append_only");
    expect(text).toContain("trg_reconciliation_exception_update_guard");
    expect(text).toContain("trg_collector_cdc_event_match_guard");
    expect(text).toMatch(/is_demo|disposable|wipe/i);
    // Surface the migration text in the test output / report paste.
    // eslint-disable-next-line no-console
    console.log("\n----- 012_wipe_disable_update_guards.sql -----\n" + text + "\n----- end -----\n");
  });
});

describeIfDb("migration 012 wipe safety + audit", () => {
  const run = randomUUID().slice(0, 8);
  const SLUG_CUSTOMER = `cust-012-${run}`;
  const SLUG_DEMO = `demo-012-${run}`;
  const ACTOR = `test:migration-012:${run}`;

  beforeAll(async () => {
    await migrateUp();
  });

  afterAll(async () => {
    const pool = getPool();
    try {
      await pool.query(`SELECT platform_wipe_tenant($1, true, $2)`, [
        SLUG_DEMO,
        ACTOR,
      ]);
    } catch {
      /* already gone or never created */
    }
    await pool.query(`DELETE FROM organization WHERE slug = ANY($1::text[])`, [
      [SLUG_CUSTOMER, SLUG_DEMO],
    ]).catch(() => undefined);
    await closePool();
  });

  it("refuses wipe of a tenant that is not is_demo and not is_test", async () => {
    const pool = getPool();
    const org = await pool.query<{ organization_id: string }>(
      `INSERT INTO organization (name, slug, is_demo, is_test)
       VALUES ($1, $2, false, false)
       RETURNING organization_id`,
      [`Customer 012 ${run}`, SLUG_CUSTOMER],
    );
    const orgId = org.rows[0]!.organization_id;
    await expect(
      pool.query(`SELECT platform_wipe_tenant($1, true, $2)`, [
        SLUG_CUSTOMER,
        ACTOR,
      ]),
    ).rejects.toThrow(/not_wipeable|neither is_demo nor is_test/i);
    const still = await pool.query(
      `SELECT 1 FROM organization WHERE organization_id = $1`,
      [orgId],
    );
    expect(still.rowCount).toBe(1);
    const audit = await pool.query(
      `SELECT 1 FROM platform_tenant_wipe_audit
        WHERE tenant_slug = $1 AND actor = $2`,
      [SLUG_CUSTOMER, ACTOR],
    );
    expect(audit.rowCount).toBe(0);
  });

  it("wipes an is_demo tenant and writes platform_tenant_wipe_audit", async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO organization (name, slug, is_demo, is_test)
       VALUES ($1, $2, true, false)`,
      [`Demo 012 ${run}`, SLUG_DEMO],
    );
    await pool.query(`SELECT platform_wipe_tenant($1, true, $2)`, [
      SLUG_DEMO,
      ACTOR,
    ]);
    const gone = await pool.query(
      `SELECT 1 FROM organization WHERE slug = $1`,
      [SLUG_DEMO],
    );
    expect(gone.rowCount).toBe(0);
    const audit = await pool.query<{ actor: string; tenant_slug: string }>(
      `SELECT actor, tenant_slug FROM platform_tenant_wipe_audit
        WHERE tenant_slug = $1 AND actor = $2
        ORDER BY wiped_at DESC NULLS LAST
        LIMIT 1`,
      [SLUG_DEMO, ACTOR],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]!.actor).toBe(ACTOR);
  });

  it("append-only trigger names after 012 match wipe disable pattern", async () => {
    const pool = getPool();
    const rows = await pool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
        WHERE tgname IN (
          'trg_decision_token_append_only',
          'trg_reconciliation_exception_append_only',
          'trg_collector_cdc_event_append_only'
        )
        ORDER BY tgname`,
    );
    expect(rows.rows.map((r) => r.tgname)).toEqual([
      "trg_collector_cdc_event_append_only",
      "trg_decision_token_append_only",
      "trg_reconciliation_exception_append_only",
    ]);
  });
});
