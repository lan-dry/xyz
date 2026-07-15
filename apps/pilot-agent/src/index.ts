import { pilotConfig } from "./config.js";
import { assertAegisApiReachable } from "./preflight.js";
import { runSupportRefundScenario } from "./scenario-support-refund.js";

async function main() {
  await assertAegisApiReachable(pilotConfig);
  const result = await runSupportRefundScenario(pilotConfig);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Cannot reach Aegis API") || msg.toLowerCase().includes("fetch failed")) {
    console.error(`\n${msg}\n`);
  } else {
    console.error(msg);
  }
  process.exit(1);
});
