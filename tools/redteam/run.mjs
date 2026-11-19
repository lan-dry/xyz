#!/usr/bin/env node
/**
 * pnpm test:redteam
 *
 * 1) Always: bank-simulator unit tests (systems + redteam panel) + aegis-api redteam-suite
 * 2) If BANK_SIMULATOR_URL (default http://127.0.0.1:4000) is healthy: hit live Red Team API
 * 3) Report Partial when live stack is down
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIM_URL = (process.env.BANK_SIMULATOR_URL ?? "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...opts.env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function liveStack() {
  try {
    const r = await fetch(`${SIM_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { up: false, reason: `health HTTP ${r.status}` };
    const attacks = await fetch(`${SIM_URL}/api/redteam`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!attacks.ok) {
      return {
        up: false,
        reason: `/api/redteam HTTP ${attacks.status} (old simulator without Stage 8? restart with pnpm bank:up)`,
      };
    }
    const body = await attacks.json();
    if (!Array.isArray(body.attacks) || body.attacks.length < 18) {
      return {
        up: false,
        reason: `Stage 8 catalog missing (got ${body.attacks?.length ?? 0} attacks)`,
      };
    }
    const results = [];
    for (const id of [1, 6, 11, 16]) {
      const res = await fetch(`${SIM_URL}/api/redteam/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Simulator": "1" },
        body: JSON.stringify({ attack_id: id }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json();
      results.push({ id, ok: json.ok === true, result: json.result });
    }
    const honest = await fetch(`${SIM_URL}/api/honest-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Simulator": "1" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    const honestBody = await honest.json();
    return {
      up: true,
      attack_count: body.attacks.length,
      sample: results,
      honest: honestBody.evidence,
    };
  } catch (err) {
    return { up: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

console.log("\n=== pnpm test:redteam ===\n");

console.log("--- bank-simulator systems + redteam panel ---\n");
const bankCode = await run("pnpm", [
  "--filter",
  "@salanor/bank-simulator",
  "test",
]);

console.log("\n--- aegis-api redteam-suite ---\n");
const apiCode = await run("pnpm", [
  "--filter",
  "aegis-api",
  "exec",
  "vitest",
  "run",
  "--no-file-parallelism",
  "test/redteam-suite.test.ts",
]);

console.log("\n--- live stack (optional) ---\n");
const live = await liveStack();
if (live.up) {
  console.log(`Live simulator at ${SIM_URL}: ${live.attack_count} attacks catalogued`);
  console.log(JSON.stringify(live.sample, null, 2));
  console.log("Honest limit:", JSON.stringify(live.honest));
} else {
  console.log(`Partial: live stack not up (${live.reason}).`);
  console.log("Start with: pnpm bank:up  (then re-run pnpm test:redteam)");
}

const failed = bankCode !== 0 || apiCode !== 0;
console.log(
  `\n=== test:redteam ${failed ? "FAILED" : "OK"}${live.up ? "" : " (live Partial)"} ===\n`,
);
process.exit(failed ? 1 : 0);
