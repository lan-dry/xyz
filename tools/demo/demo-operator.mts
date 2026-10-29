/**
 * Phase 8 demo operator: trigger a payout and print Console deep links.
 *
 * Requires: pnpm dev (console :3000, api :8080, id :8091) + Northwind fixture.
 *
 *   pnpm demo:operator
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const consoleOrigin =
  process.env.CONSOLE_ORIGIN?.replace(/\/$/, "") || "http://localhost:3000";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolveCode, reject) => {
    const child = spawn(cmd, args, {
      cwd: resolve(process.cwd()),
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolveCode(code ?? 1));
  });
}

console.log("=== Salanor Aegis demo operator ===\n");
console.log("1) Ensuring approval + beneficiary-match policies…");
let code = await run("pnpm", ["pilot:ensure-approval-policy"]);
if (code !== 0) process.exit(code);
code = await run("pnpm", ["pilot:ensure-beneficiary-match-policy"]);
if (code !== 0) process.exit(code);

console.log("\n2) Triggering USD payout (Ask a person)…");
code = await run("pnpm", ["pilot:agent:payout"]);
if (code !== 0) {
  console.error("Payout failed. Check aegis-api + pilot env.");
  process.exit(code);
}

console.log("\n3) Manipulated-agent refund Stop (§13.1)…");
code = await run("pnpm", ["pilot:agent:manipulated"]);
if (code !== 0) {
  console.warn("Manipulated demo failed (non-fatal for payout path).");
}

console.log("\n4) Publishing witness + transparency proofs (needed for /verify)…");
code = await run("pnpm", ["pilot:publish-proofs"]);
if (code !== 0) {
  console.warn(
    "Proof publish failed — after Approve + resume, run: pnpm pilot:publish-proofs",
  );
}

console.log(`
=== Deep links (open while signed in as Northwind admin) ===
Overview:     ${consoleOrigin}/aegis
Live feed:    ${consoleOrigin}/aegis/live
Approvals:    ${consoleOrigin}/aegis/approvals
Coverage:     ${consoleOrigin}/aegis/coverage
Incidents:    ${consoleOrigin}/aegis/incidents?ensure=duplicate-payout
Evidence:     ${consoleOrigin}/aegis/evidence
Verify:       ${consoleOrigin}/aegis/verify  (or /verify)
Resume after approve:
  pnpm pilot:agent:resume:payout <apr_…>
  (resume auto-publishes proofs; if /verify still pending: pnpm pilot:publish-proofs)
Manipulated stop:
  pnpm pilot:agent:manipulated

=== 10-minute room checklist ===
[ ] Overview lived-in + value report (amount stopped, 30d)
[ ] Coverage and limits panel copy visible on Overview
[ ] Approve payout → resume → receipt seals (action digest bound)
[ ] Manipulated-agent case: Stopped destination ≠ customer on record
[ ] Incident replay + policy today
[ ] Evidence / Risk Pack
[ ] Verify live event (after publish-proofs) + tamper demo
[ ] Share receipt expiring link
`);
process.exit(0);
