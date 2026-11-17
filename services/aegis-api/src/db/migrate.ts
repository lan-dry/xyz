import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

/** Forward-only SQL migrations. Greenfield starts at `001_baseline`. */
const MIGRATIONS = [
  { version: "001_baseline", file: "001_baseline.sql" },
  {
    version: "002_ensure_organization_demo_flags",
    file: "002_ensure_organization_demo_flags.sql",
  },
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

async function organizationHasDemoFlags(): Promise<boolean> {
  const result = await getPool().query<{ ok: boolean }>(
    `SELECT (
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'organization'
           AND column_name = 'is_demo'
       ) AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'organization'
           AND column_name = 'is_test'
       )
     ) AS ok`,
  );
  return result.rows[0]?.ok === true;
}

/** Idempotent repair when 001 was applied from an older baseline (or 002 was skipped). */
async function ensureOrganizationDemoFlags(): Promise<void> {
  if (await organizationHasDemoFlags()) {
    console.log("migrate: organization.is_demo / is_test present");
    return;
  }
  console.log(
    "migrate: organization.is_demo / is_test missing — applying 002_ensure_organization_demo_flags.sql",
  );
  const sql = readMigration("002_ensure_organization_demo_flags.sql");
  const client = await getPool().connect();
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migration (version) VALUES ($1)
       ON CONFLICT (version) DO NOTHING`,
      ["002_ensure_organization_demo_flags"],
    );
  } finally {
    client.release();
  }
  if (!(await organizationHasDemoFlags())) {
    throw new Error(
      "migrate: organization.is_demo / is_test still missing after 002. " +
        "Use MIGRATION_DATABASE_URL (schema owner) on aegis-api, and confirm it is the same Postgres as salanor-id DATABASE_URL.",
    );
  }
  console.log("migrate: organization.is_demo / is_test repaired");
}

export async function migrateUp(options?: {
  /** Stop after applying this version (inclusive). */
  throughVersion?: string;
}): Promise<void> {
  await ensureMigrationTable();
  for (const migration of MIGRATIONS) {
    if (await isApplied(migration.version)) {
      console.log(`migrate: skip ${migration.version} (already applied)`);
      if (
        options?.throughVersion &&
        migration.version === options.throughVersion
      ) {
        break;
      }
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
    if (
      options?.throughVersion &&
      migration.version === options.throughVersion
    ) {
      break;
    }
  }
  // Always verify demo flags on the DB we just migrated (catches wrong-DB / skipped-002 drift).
  if (!options?.throughVersion) {
    await ensureOrganizationDemoFlags();
  }
}
