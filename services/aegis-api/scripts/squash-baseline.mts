/**
 * Build a single greenfield 001_baseline.sql from a pg_dump --schema-only of a
 * fully migrated database, plus the canonical seed INSERTs (not live tenant data).
 *
 * Usage (from repo root, after dumping):
 *   pnpm --filter aegis-api exec tsx ./scripts/squash-baseline.mts
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);
const dumpPath = join(migrationsDir, "_dump_schema.sql");
const outPath = join(migrationsDir, "001_baseline.sql");

const dump = readFileSync(dumpPath, "utf8");

/** Drop dump noise + schema_migration (created by migrate.ts). */
function cleanDump(sql: string): string {
  const lines = sql.split(/\r?\n/);
  const out: string[] = [];
  let skipBlock = false;
  let skipUntilBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("\\restrict") || trimmed.startsWith("\\unrestrict")) {
      continue;
    }
    if (trimmed.startsWith("-- Dumped from") || trimmed.startsWith("-- Dumped by")) {
      continue;
    }
    if (trimmed === "--" && lines[i + 1]?.includes("PostgreSQL database dump")) {
      skipUntilBlank = true;
      continue;
    }
    if (skipUntilBlank) {
      if (trimmed === "") skipUntilBlank = false;
      continue;
    }
    if (
      trimmed.startsWith("SET ") ||
      trimmed.startsWith("SELECT pg_catalog.set_config")
    ) {
      continue;
    }

    // Skip schema_migration objects entirely (table, constraints, indexes).
    if (
      /Name: schema_migration/.test(trimmed) ||
      /CREATE TABLE public\.schema_migration/.test(trimmed) ||
      /ALTER TABLE ONLY public\.schema_migration/.test(trimmed) ||
      /CREATE .+ INDEX .+ ON public\.schema_migration/.test(trimmed) ||
      /CONSTRAINT schema_migration_/.test(trimmed)
    ) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) {
      if (trimmed === "" || trimmed.startsWith("-- Name:")) {
        skipBlock = false;
        if (trimmed.startsWith("-- Name:") && !/schema_migration/.test(trimmed)) {
          // fall through to keep this new object header
        } else {
          continue;
        }
      } else {
        continue;
      }
    }

    // Drop trailing dump footer
    if (trimmed.startsWith("-- PostgreSQL database dump complete")) {
      break;
    }

    out.push(line);
  }

  // Collapse excessive blank lines
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return joined;
}

const seeds = `
-- ---------------------------------------------------------------------------
-- Seeds (greenfield only — never dump live tenants into baseline)
-- ---------------------------------------------------------------------------

INSERT INTO plan_catalog (
  plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
  retention_days, self_serve, sort_order,
  list_price, list_price_detail, tagline, billing_note, marketing_highlighted
) VALUES
  (
    'free', 'Free', 10000, 3, 5, 90, false, 10,
    '$0', 'forever', 'Evaluate and demo', 'Self-serve signup · no card', false
  ),
  (
    'team', 'Team', 100000, 15, 25, 365, true, 20,
    '$299', '/ month', 'Production governance', 'Billed monthly · annual discount on request', true
  ),
  (
    'enterprise', 'Enterprise', NULL, 100, 500, 2555, false, 30,
    'Custom', 'from ~$999 / mo', 'Regulated scale', 'Annual contract · invoice or PO', false
  );

-- Platform audit_log anchor + staff home org after db:seed:bootstrap.
INSERT INTO organization (name, slug, plan, active)
VALUES ('Salanor Platform', 'salanor-platform', 'enterprise', false);

-- Platform email settings: singleton row is created on first save in the console.
-- App role must never EXECUTE platform_wipe_tenant (owner-only).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION platform_wipe_tenant(text, boolean, text) FROM aegis_app';
    EXECUTE 'REVOKE ALL ON TABLE platform_tenant_wipe_audit FROM aegis_app';
  END IF;
END
$$;
`.trim();

const header = `-- Baseline: full Aegis + platform + web CMS schema (empty DB only).
-- Single greenfield migration — final table/function definitions, no upgrade ALTERs.
-- Reset: DROP SCHEMA public CASCADE; CREATE SCHEMA public; pnpm db:migrate.

BEGIN;

-- Functions are created before tables (pg_dump order); defer body validation until commit.
SET LOCAL check_function_bodies = false;
`;

const body = cleanDump(dump);
const finalSql = `${header}\n${body}\n\n${seeds}\n\nCOMMIT;\n`;

writeFileSync(outPath, finalSql, "utf8");
console.log(`Wrote ${outPath} (${finalSql.length} bytes)`);

// Remove temp dumps
for (const f of ["_dump_schema.sql", "_dump_seeds.sql"]) {
  const p = join(migrationsDir, f);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`Removed ${f}`);
  }
}
