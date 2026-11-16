import "./load-env.js";
import { closePool } from "./pool.js";
import { migrateUp } from "./migrate.js";

// Release-step migrations run as the schema owner. The runtime service uses a
// restricted role (DATABASE_URL); MIGRATION_DATABASE_URL overrides it for this process only.
const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim();
if (migrationUrl) {
  process.env.DATABASE_URL = migrationUrl;
}

try {
  await migrateUp();
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await closePool();
}
