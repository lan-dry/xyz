import { loadPilotConfig } from "./config.js";
import { assertAegisApiReachable } from "./preflight.js";
import {
  resumeSupportRefundAfterApproval,
  runSupportRefundApprovalScenario,
} from "./scenario-support-refund-approval.js";
import { runSupportRefundScenario } from "./scenario-support-refund.js";

async function main() {
  const pilotConfig = await loadPilotConfig();
  await assertAegisApiReachable(pilotConfig);

  const mode = process.argv[2]?.trim();
  if (mode === "approval") {
    const result = await runSupportRefundApprovalScenario(pilotConfig);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }
  if (mode === "resume") {
    const approvalId = process.argv[3]?.trim();
    if (!approvalId) {
      console.error("Usage: pnpm pilot:agent:resume <approval_id>");
      process.exit(1);
    }
    const result = await resumeSupportRefundAfterApproval(pilotConfig, approvalId);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

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
