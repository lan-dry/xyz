import { afterAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { applyIntegrationFixture } from "./integration-fixture.js";

const databaseUrl = process.env.DATABASE_URL;
/**
 * DROP SCHEMA is destructive. Never run against a developer’s lived-in local DB
 * unless explicitly opted in (CI / throwaway Postgres).
 */
const allowDestructive =
  process.env.AEGIS_ALLOW_DESTRUCTIVE_MIGRATE_TEST === "1" ||
  process.env.CI === "true";
const describeIfDb =
  databaseUrl && allowDestructive ? describe : describe.skip;

describeIfDb("migrations (destructive; AEGIS_ALLOW_DESTRUCTIVE_MIGRATE_TEST=1)", () => {
  afterAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
    await closePool();
  });

  it("migrate up applies baseline; drop schema + re-apply succeeds", async () => {
    await migrateUp();
    let result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization'
      ) AS exists`,
    );
    expect(result.rows[0]?.exists).toBe(true);

    await getPool().query("DROP SCHEMA public CASCADE");
    await getPool().query("CREATE SCHEMA public");
    await getPool().query("GRANT ALL ON SCHEMA public TO PUBLIC");

    await migrateUp();
    await applyIntegrationFixture(getPool());
    result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization'
      ) AS exists`,
    );
    expect(result.rows[0]?.exists).toBe(true);
  });
});
