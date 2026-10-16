import "./load-env.js";
import { migrateUp } from "./migrate.js";
import { closePool } from "./pool.js";

await migrateUp();
await closePool();
