import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

/** Forward-only SQL migrations. */
const MIGRATIONS = [
  { version: "001_baseline", file: "001_baseline.sql" },
  { version: "002_witness_root_timestamp", file: "002_witness_root_timestamp.sql" },
  { version: "003_region_and_field_vault", file: "003_region_and_field_vault.sql" },
  {
    version: "004_wipe_include_sensitive_field_vault",
    file: "004_wipe_include_sensitive_field_vault.sql",
  },
  {
    version: "005_forensic_receipt_outcome_declined_released",
    file: "005_forensic_receipt_outcome_declined_released.sql",
  },
  { version: "006_sources", file: "006_sources.sql" },
  { version: "007_evidence_grade_change", file: "007_evidence_grade_change.sql" },
  { version: "008_decision_token", file: "008_decision_token.sql" },
  { version: "009_reconciliation", file: "009_reconciliation.sql" },
  { version: "010_collector_cdc", file: "010_collector_cdc.sql" },
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
}
