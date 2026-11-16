import { randomBytes } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "@salanor/platform-auth";
import pg from "pg";

const root = resolve(import.meta.dirname, "../../..");
const envPath = resolve(root, ".env");
const env: Record<string, string> = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  env[m[1]] = v;
}

let password = env.AEGIS_DEMO_APPROVAL_PASSWORD;
if (!password || password.length < 10) {
  password = `DemoLocal-${randomBytes(9).toString("base64url")}`;
  appendFileSync(
    envPath,
    `\n# Local demo password (min 10). Added ${new Date().toISOString()}\nAEGIS_DEMO_APPROVAL_PASSWORD=${password}\n`,
  );
  console.log("Wrote AEGIS_DEMO_APPROVAL_PASSWORD to .env (value not printed).");
} else {
  console.log("Using existing AEGIS_DEMO_APPROVAL_PASSWORD from .env.");
}

const passwordHash = hashPassword(password);
const client = new pg.Client({
  connectionString: "postgresql://salanor:salanor@127.0.0.1:5435/aegis",
});
await client.connect();
const res = await client.query<{ email: string }>(
  `UPDATE account SET password_hash = $1, updated_at = now()
   WHERE lower(email) LIKE '%@demo.test'
   RETURNING email`,
  [passwordHash],
);
console.log(`Updated password on ${res.rowCount} @demo.test accounts:`);
for (const row of res.rows) console.log(`  ${row.email}`);
await client.end();
