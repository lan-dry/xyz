import "./load-env.js";
import { migrateUp } from "./migrate.js";
import { runScheduledRetentionForAllTenants } from "../compliance/retention-scheduler.js";
import { getPool } from "./pool.js";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const hourArg = process.argv.find((a) => a.startsWith("--hour="));
  const utcHour = hourArg ? Number(hourArg.split("=")[1]) : undefined;

  await migrateUp();
  const summary = await runScheduledRetentionForAllTenants({
    force,
    utcHour: Number.isFinite(utcHour) ? utcHour : undefined,
  });
  console.log(JSON.stringify(summary, null, 2));
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
