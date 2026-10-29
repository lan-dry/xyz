import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, "services/stoa-api/.env"), override: true });

const url = process.env.STOA_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error("STOA_DATABASE_URL (or DATABASE_URL) is required");
}

const parsed = new URL(url.replace(/^postgresql:/i, "http:"));
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0];
if (!dbName || dbName === "postgres") {
  throw new Error(`Refusing to create ambiguous database from URL path: ${dbName}`);
}

const adminUrl = new URL(url.replace(/^postgresql:/i, "http:"));
adminUrl.pathname = "/postgres";
const adminConn = adminUrl.toString().replace(/^http:/i, "postgresql:");

const admin = new pg.Client({ connectionString: adminConn });
await admin.connect();
try {
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if (!exists.rows[0]) {
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`created database ${dbName}`);
  } else {
    console.log(`database ${dbName} already exists`);
  }
} finally {
  await admin.end();
}
