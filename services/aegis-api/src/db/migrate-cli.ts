import "./load-env.js";
import { closePool } from "./pool.js";
import { migrateUp } from "./migrate.js";

try {
  await migrateUp();
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await closePool();
}
