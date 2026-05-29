import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateDown, migrateUp } from "../src/db/migrate.js";

async function seedDev(): Promise<void> {
  const seedPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../tools/seed/dev.sql",
  );
  await getPool().query(readFileSync(seedPath, "utf8"));
}

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb("migrations", () => {
  afterAll(async () => {
    await migrateUp();
    await seedDev();
    await closePool();
  });

  it("migrate up → down → up succeeds", async () => {
    await migrateUp();
    let result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization'
      ) AS exists`,
    );
    expect(result.rows[0]?.exists).toBe(true);

    await migrateDown();
    result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization'
      ) AS exists`,
    );
    expect(result.rows[0]?.exists).toBe(false);

    await migrateUp();
    await seedDev();
    result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization'
      ) AS exists`,
    );
    expect(result.rows[0]?.exists).toBe(true);
  });
});
