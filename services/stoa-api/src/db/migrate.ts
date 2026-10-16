import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

const MIGRATIONS = [
  { version: "001_baseline", file: "001_baseline.sql" },
  { version: "002_platform_org_link", file: "002_platform_org_link.sql" },
  { version: "003_tenant_settings", file: "003_tenant_settings.sql" },
  {
    version: "004_attachments_usage",
    file: "004_attachments_usage.sql",
  },
  { version: "005_sites_admin", file: "005_sites_admin.sql" },
  { version: "006_site_directory", file: "006_site_directory.sql" },
  { version: "007_site_managers", file: "007_site_managers.sql" },
  {
    version: "008_compliance_gateway",
    file: "008_compliance_gateway.sql",
  },
  {
    version: "009_message_display_vault",
    file: "009_message_display_vault.sql",
  },
  {
    version: "010_display_without_plaintext",
    file: "010_display_without_plaintext.sql",
  },
] as const;

async function ensureMigrationTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS stoa_schema_migration (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(version: string): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM stoa_schema_migration WHERE version = $1
    ) AS exists`,
    [version],
  );
  return result.rows[0]?.exists ?? false;
}

export async function migrateUp(): Promise<void> {
  await ensureMigrationTable();
  for (const migration of MIGRATIONS) {
    if (await isApplied(migration.version)) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, migration.file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO stoa_schema_migration (version) VALUES ($1)`,
        [migration.version],
      );
      await client.query("COMMIT");
      console.log(`Applied migration ${migration.version}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
