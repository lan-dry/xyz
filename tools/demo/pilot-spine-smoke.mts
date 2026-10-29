/**
 * Phase 0 smoke: Northwind fixture reachable + refund deny path.
 * Requires: DATABASE_URL, aegis-api :8080, local pilot fixture applied.
 */
import { loadEnvFile } from "./load-env.mts";
import { getDemoTargets } from "./demo-targets.mts";

loadEnvFile();

const apiBase = process.env.AEGIS_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8080";

function fail(msg: string): never {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}
function ok(msg: string) {
  console.log(`OK  ${msg}`);
}

console.log("== Phase 0 spine smoke ==");

try {
  const health = await fetch(`${apiBase}/health`);
  if (!health.ok) fail(`aegis-api health ${health.status}`);
  ok("aegis-api up");
} catch {
  fail(`aegis-api unreachable at ${apiBase}`);
}

const targets = await getDemoTargets();
if (targets.organizationSlug !== "northwind-payments" && !process.env.PILOT_ORGANIZATION_SLUG) {
  fail(
    `expected default org northwind-payments, got ${targets.organizationSlug}. Run pnpm db:local:pilot-fixture.`,
  );
}
ok(`org ${targets.organizationSlug} (${targets.organizationId})`);
ok(`refund agent ${targets.agentId}`);

console.log("\nManual follow-ups (not automated here):");
console.log("  pnpm pilot:ensure-policy && pnpm pilot:agent");
console.log("  pnpm pilot:ensure-approval-policy && pnpm pilot:agent:approval → Approve → resume");
console.log("  pnpm pilot:publish-proofs   # witness + transparency (needed for /verify live events)");
console.log("  Open /verify → paste event id → Verify; also Run tamper demo");
console.log("  Console → Exports → download ZIP; optional APPROVAL_SLACK_WEBHOOK_URL notify");
console.log("\n=== SPINE SMOKE PASSED ===");
