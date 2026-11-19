import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
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
  { version: "011_stage7_facts", file: "011_stage7_facts.sql" },
  {
    version: "012_wipe_disable_update_guards",
    file: "012_wipe_disable_update_guards.sql",
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

/**
 * Idempotent Stage 1 correction: organization_setting_change + setting_change
 * outcome + wipe allowlist entry. Safe when 006 already ran without this table.
 */
export async function ensureOrganizationSettingChangeTable(
  pool: pg.Pool | pg.PoolClient = getPool(),
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_setting_change (
      change_id text PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organization(organization_id),
      setting_key text NOT NULL,
      from_value jsonb NOT NULL,
      to_value jsonb NOT NULL,
      requested_by text NOT NULL,
      confirmed_by text,
      status text NOT NULL CHECK (status IN ('pending','applied','cancelled')),
      created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS organization_setting_change_org_pending_idx
      ON organization_setting_change (organization_id, setting_key, status)
      WHERE status = 'pending'
  `);

  // Allow forensic outcome used when sealing setting changes.
  await pool.query(`
    ALTER TABLE forensic_receipt
      DROP CONSTRAINT IF EXISTS forensic_receipt_outcome_check
  `);
  await pool.query(`
    ALTER TABLE forensic_receipt
      ADD CONSTRAINT forensic_receipt_outcome_check
      CHECK (
        outcome = ANY (
          ARRAY[
            'allow'::text,
            'hold'::text,
            'stop'::text,
            'expired'::text,
            'approved'::text,
            'declined'::text,
            'released'::text,
            'grade_change'::text,
            'executed'::text,
            'execution_mismatch'::text,
            'break_glass'::text,
            'reconciliation_report'::text,
            'setting_change'::text
          ]
        )
      )
  `);

  const wipe = await pool.query<{ t: string[] }>(
    `SELECT platform_tenant_wipe_tables() AS t`,
  );
  let next = [...(wipe.rows[0]?.t ?? [])];
  const missing: string[] = [];
  if (!next.includes("organization_setting_change")) {
    missing.push("organization_setting_change");
  }
  const hasInputCopy = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'input_commitment_copy'
     ) AS exists`,
  );
  if (hasInputCopy.rows[0]?.exists && !next.includes("input_commitment_copy")) {
    missing.push("input_commitment_copy");
  }
  if (missing.length > 0) {
    // Insert before source_* tables when present; otherwise append.
    const insertAt = next.findIndex((t) => t.startsWith("source_"));
    if (insertAt >= 0) {
      next = [
        ...next.slice(0, insertAt),
        ...missing,
        ...next.slice(insertAt),
      ];
    } else {
      next = [...next, ...missing];
    }
    // Prefer input_commitment_copy near other evidence/sensitive rows when both missing.
    if (
      missing.includes("input_commitment_copy") &&
      next.includes("sensitive_field_vault")
    ) {
      next = next.filter((t) => t !== "input_commitment_copy");
      const vaultAt = next.indexOf("sensitive_field_vault");
      next.splice(vaultAt + 1, 0, "input_commitment_copy");
    }
    const literals = next.map((t) => `'${t.replace(/'/g, "''")}'`).join(",\n    ");
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.platform_tenant_wipe_tables() RETURNS text[]
          LANGUAGE sql IMMUTABLE
          AS $$
        SELECT ARRAY[
          ${literals}
        ]::text[];
      $$
    `);
  }
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
  await ensureOrganizationSettingChangeTable();
}
