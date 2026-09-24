import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

/** Forward-only SQL migrations (one `.sql` file per version). */
const MIGRATIONS = [
  { version: "001_baseline", file: "001_baseline.sql" },
] as const;

async function ensureMigrationTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(version: string): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM schema_migration WHERE version = $1
    ) AS exists`,
    [version],
  );
  return result.rows[0]?.exists ?? false;
}

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
}

export async function migrateUp(): Promise<void> {
  await ensureMigrationTable();
  for (const migration of MIGRATIONS) {
    if (await isApplied(migration.version)) {
      continue;
    }
    const sql = readMigration(migration.file);
    const client = await getPool().connect();
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migration (version) VALUES ($1)`,
        [migration.version],
      );
      console.log(`Applied migration ${migration.version}`);
    } finally {
      client.release();
    }
  }
}
