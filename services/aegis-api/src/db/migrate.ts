import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

const MIGRATIONS = [
  {
    version: "001_initial",
    up: "001_initial.up.sql",
    down: "001_initial.down.sql",
  },
  {
    version: "002_policy_wasm",
    up: "002_policy_wasm.up.sql",
    down: "002_policy_wasm.down.sql",
  },
  {
    version: "003_transparency_log",
    up: "003_transparency_log.up.sql",
    down: "003_transparency_log.down.sql",
  },
  {
    version: "004_identity_membership",
    up: "004_identity_membership.up.sql",
    down: "004_identity_membership.down.sql",
  },
  {
    version: "005_password_reset",
    up: "005_password_reset.up.sql",
    down: "005_password_reset.down.sql",
  },
  {
    version: "006_compliance_export_stats",
    up: "006_compliance_export_stats.up.sql",
    down: "006_compliance_export_stats.down.sql",
  },
  {
    version: "007_compliance_schedule",
    up: "007_compliance_schedule.up.sql",
    down: "007_compliance_schedule.down.sql",
  },
  {
    version: "008_plan_limits_platform",
    up: "008_plan_limits_platform.up.sql",
    down: "008_plan_limits_platform.down.sql",
  },
  {
    version: "009_platform_staff",
    up: "009_platform_staff.up.sql",
    down: "009_platform_staff.down.sql",
  },
  {
    version: "010_stripe_billing",
    up: "010_stripe_billing.up.sql",
    down: "010_stripe_billing.down.sql",
  },
  {
    version: "011_email_verification",
    up: "011_email_verification.up.sql",
    down: "011_email_verification.down.sql",
  },
  {
    version: "012_platform_roles",
    up: "012_platform_roles.up.sql",
    down: "012_platform_roles.down.sql",
  },
  {
    version: "013_platform_audit_org",
    up: "013_platform_audit_org.up.sql",
    down: "013_platform_audit_org.down.sql",
  },
  {
    version: "014_session_impersonation",
    up: "014_session_impersonation.up.sql",
    down: "014_session_impersonation.down.sql",
  },
  {
    version: "015_trace_root_backfill",
    up: "015_trace_root_backfill.up.sql",
    down: "015_trace_root_backfill.down.sql",
  },
  {
    version: "016_spans_search_action_kinds",
    up: "016_spans_search_action_kinds.up.sql",
    down: "016_spans_search_action_kinds.down.sql",
  },
  {
    version: "017_contact_messages",
    up: "017_contact_messages.up.sql",
    down: "017_contact_messages.down.sql",
  },
  {
    version: "018_account_oauth",
    up: "018_account_oauth.up.sql",
    down: "018_account_oauth.down.sql",
  },
  {
    version: "019_organization_sso",
    up: "019_organization_sso.up.sql",
    down: "019_organization_sso.down.sql",
  },
  {
    version: "020_organization_onboarding",
    up: "020_organization_onboarding.up.sql",
    down: "020_organization_onboarding.down.sql",
  },
  {
    version: "021_account_login_events",
    up: "021_account_login_events.up.sql",
    down: "021_account_login_events.down.sql",
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

export async function migrateUp(): Promise<void> {
  await ensureMigrationTable();
  for (const migration of MIGRATIONS) {
    if (await isApplied(migration.version)) {
      continue;
    }
    const sql = readMigration(migration.up);
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

export async function migrateDown(): Promise<void> {
  await ensureMigrationTable();
  const applied = [...MIGRATIONS].reverse();
  for (const migration of applied) {
    if (!(await isApplied(migration.version))) {
      continue;
    }
    const sql = readMigration(migration.down);
    const client = await getPool().connect();
    try {
      await client.query(sql);
      await client.query(`DELETE FROM schema_migration WHERE version = $1`, [
        migration.version,
      ]);
      console.log(`Rolled back migration ${migration.version}`);
    } finally {
      client.release();
    }
  }
}

