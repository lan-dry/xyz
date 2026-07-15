/**
 * Publish pending witness proofs to the append-only transparency log.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import "../db/load-env.js";
import { publishTransparencyLogForOrg } from "./publish.js";

function loadEnvFile(): void {
  const root = resolve(import.meta.dirname, "../../../..");
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
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const organizationId =
  process.env.DEMO_ORGANIZATION_ID ?? "11111111-1111-4111-8111-111111111111";

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const result = await publishTransparencyLogForOrg(client, organizationId);
  console.log(
    JSON.stringify({ ok: true, organization_id: organizationId, ...result }, null, 2),
  );
} finally {
  client.release();
  await pool.end();
}
