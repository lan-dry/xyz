import "./load-env.js";
import { closePool } from "./pool.js";
import { migrateDown, migrateUp } from "./migrate.js";

const command = process.argv[2];
if (command !== "up" && command !== "down") {
  console.error("Usage: migrate-cli.ts <up|down>");
  process.exit(1);
}

try {
  if (command === "up") {
    await migrateUp();
  } else {
    await migrateDown();
  }
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await closePool();
}
