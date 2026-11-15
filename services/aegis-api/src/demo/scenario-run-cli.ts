#!/usr/bin/env node
/**
 * Forensic demo scenarios — IN-PROCESS unit fixtures (NOT live HTTP).
 *
 * Runs pack evaluate / approval guards / receipt verify in-memory with no
 * HTTP client and no database. For live HTTP against a running API + DB:
 *   pnpm --filter aegis-api scenario:live
 *
 * Usage:
 *   pnpm --filter aegis-api scenario:run
 *   pnpm --filter aegis-api scenario:run -- 1,2,3
 */
import { runScenarios, scenarioRunners } from "./scenario-runners.js";

async function main() {
  const arg = process.argv[2] ?? "all";
  const ids =
    arg === "all"
      ? Object.keys(scenarioRunners).map(Number).sort((a, b) => a - b)
      : arg.split(",").map((s) => Number(s.trim()));

  console.log(
    "scenario:run → in-process fixtures (NOT live HTTP; use scenario:live for that)",
  );

  let failed = 0;
  const results = await runScenarios(ids);
  for (const result of results) {
    console.log(
      `${result.ok ? "PASS" : "FAIL"} scenario ${result.id} ${result.name} — ${result.detail}`,
    );
    if (!result.ok) failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
