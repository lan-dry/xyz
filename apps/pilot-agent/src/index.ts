import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPilotConfig } from "./config.js";
import { assertAegisApiReachable } from "./preflight.js";
import {
  resumeSupportRefundAfterApproval,
  runSupportRefundApprovalScenario,
} from "./scenario-support-refund-approval.js";
import { runSupportRefundScenario } from "./scenario-support-refund.js";
import {
  resumeMerchantPayoutAfterApproval,
  runMerchantPayoutScenario,
} from "./scenario-merchant-payout.js";
import { runManipulatedRefundScenario } from "./scenario-manipulated-refund.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

/** Merkle + transparency — required before public /verify on live events. */
async function publishProofs(): Promise<void> {
  console.log("\nPublishing witness + transparency proofs…");
  await new Promise<void>((resolveDone, reject) => {
    const child = spawn("pnpm", ["pilot:publish-proofs"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveDone();
      else {
        console.warn(
          "Proof publish failed — run manually: pnpm pilot:publish-proofs",
        );
        resolveDone();
      }
    });
  });
}

async function main() {
  const mode = process.argv[2]?.trim();
  const agentKind = mode === "payout" || mode === "resume-payout" ? "payout" : "refund";
  const pilotConfig = await loadPilotConfig(agentKind);
  await assertAegisApiReachable(pilotConfig);

  if (mode === "manipulated") {
    const result = await runManipulatedRefundScenario(pilotConfig);
    await publishProofs();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  if (mode === "approval" || mode === "approval-gold") {
    const result = await runSupportRefundApprovalScenario(pilotConfig, {
      segment: mode === "approval-gold" ? "gold" : "standard",
    });
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
  if (mode === "payout" || mode === "risk-score") {
    const result = await runMerchantPayoutScenario(pilotConfig, {
      riskScore: mode === "risk-score" ? 72 : undefined,
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }
  if (mode === "resume-payout") {
    const approvalId = process.argv[3]?.trim();
    if (!approvalId) {
      console.error("Usage: pnpm pilot:agent:resume:payout <approval_id>");
      process.exit(1);
    }
    const result = await resumeMerchantPayoutAfterApproval(pilotConfig, approvalId);
    await publishProofs();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  const result = await runSupportRefundScenario(pilotConfig);
  await publishProofs();
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
