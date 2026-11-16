/**
 * Vitest setup: use a dedicated local DB on the demo Postgres host (:5435),
 * not .env :5432/Neon (auth fail) and not the live demo `aegis` DB (shared
 * @demo.test accounts pollute sessions → 403/404 in HTTP tests).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotEnv(resolve(root, ".env.local"));
loadDotEnv(resolve(root, ".env"));

const TEST_DB =
  process.env.AEGIS_TEST_DATABASE_URL?.trim() ||
  "postgresql://salanor:salanor@127.0.0.1:5435/aegis_test";

async function ensureTestDatabase(url: string): Promise<void> {
  const u = new URL(url);
  const dbName = u.pathname.replace(/^\//, "") || "aegis_test";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) return;
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
    const exists = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } catch {
    /* demo Postgres may be down — suites will skip/fail with a clear error */
  } finally {
    await client.end().catch(() => undefined);
  }
}

const current = process.env.DATABASE_URL?.trim() ?? "";
const needsLocalTestDb =
  !process.env.AEGIS_TEST_DATABASE_URL &&
  (!current ||
    /:5432(?:\/|$)/.test(current) ||
    /\/aegis(?:\?|$)/.test(current) ||
    /neon\.tech|amazonaws\.com|supabase\.co/i.test(current));

if (needsLocalTestDb || process.env.AEGIS_TEST_DATABASE_URL) {
  await ensureTestDatabase(TEST_DB);
  process.env.DATABASE_URL = TEST_DB;
  process.env.DATABASE_URL_UNPOOLED = TEST_DB;
}

// B2: production/demo default is fail-safe (503 on evidence write failure).
// Integration harnesses that only read `decision` after a missing Workflow
// Bridge key opt out explicitly — never the reverse.
if (process.env.AEGIS_ENFORCE_REQUIRE_EVIDENCE === undefined) {
  process.env.AEGIS_ENFORCE_REQUIRE_EVIDENCE = "0";
}
