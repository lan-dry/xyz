/**
 * R1: create empty + demo-copy DBs from .env DATABASE_URL (demo-shaped source).
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
for (const name of [".env.local", ".env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).trim();
    // Prefer committed .env over leftover shell overrides for this script.
    process.env[key] = value;
  }
}

const sourceUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
const u = new URL(sourceUrl);
const admin = new URL(sourceUrl);
admin.pathname = "/postgres";
const srcDb = decodeURIComponent(u.pathname.replace(/^\//, "") || "aegis");
const EMPTY = "aegis_r1_empty";
const DEMO = "aegis_r1_demo";

console.log("source_db", srcDb);
console.log("admin", admin.toString().replace(/:[^:@/]+@/, ":****@"));

async function recreate(name: string, template: string | null) {
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  const victims = template ? [name, template] : [name];
  for (const d of victims) {
    await c
      .query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [d],
      )
      .catch(() => undefined);
  }
  await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  if (template) {
    await c.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
    console.log(`created ${name} TEMPLATE ${template}`);
  } else {
    await c.query(`CREATE DATABASE "${name}"`);
    console.log(`created ${name} (empty)`);
  }
  await c.end();
}

await recreate(EMPTY, null);
await recreate(DEMO, srcDb);
console.log(
  JSON.stringify({
    empty_url: sourceUrl.replace(`/${srcDb}`, `/${EMPTY}`),
    demo_url: sourceUrl.replace(`/${srcDb}`, `/${DEMO}`),
  }),
);
