#!/usr/bin/env node
/**
 * CI guard: fail if runtime demo-mode machinery is reintroduced.
 *
 * Allowed:
 *   - production-guards.ts (refuse in production)
 *   - aegis-api src/index.ts (ignore-and-warn once)
 *   - time/clock.ts (isLegacyDemoModeEnvSet)
 *   - tests that assert boot refuse / 404 / env cleanup
 *   - this file
 *   - docs/ stating removal
 *   - comment-only / string-only mentions that do not call removed APIs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FORBIDDEN_PATHS = [
  "services/aegis-api/src/bank/demo-clock.ts",
  "services/aegis-api/src/routes/demo-scenarios.ts",
  "services/aegis-api/src/routes/demo-simulator.ts",
  "services/aegis-api/src/demo/scenario-runners.ts",
  "services/aegis-api/src/demo/seed-approval-actors.ts",
  "services/aegis-api/src/demo/reset-cli.ts",
  "services/aegis-api/src/demo/simulator-stories.ts",
  "apps/web-console/src/lib/demo-simulator-server.ts",
  "apps/web-console/src/app/aegis/demo/simulator",
  "apps/web-console/src/app/api/demo/simulator",
];

/** Symbols that must not appear as live API calls (import/export/call). */
const FORBIDDEN_CALLS = [
  { re: /\bexport\s+function\s+isDemoModeAllowed\b/, why: "define isDemoModeAllowed" },
  { re: /\bexport\s+function\s+assertDemoMode\b/, why: "define assertDemoMode" },
  { re: /\bexport\s+function\s+setDemoClock\b/, why: "define setDemoClock" },
  { re: /\bexport\s+function\s+advanceDemoClock\b/, why: "define advanceDemoClock" },
  { re: /\bexport\s+function\s+resetDemoClock\b/, why: "define resetDemoClock" },
  { re: /\bexport\s+function\s+isDemoClockActive\b/, why: "define isDemoClockActive" },
  { re: /\bexport\s+(async\s+)?function\s+seedDemoApprovalActors\b/, why: "define seedDemoApprovalActors" },
  { re: /\bisDemoModeAllowed\s*\(/, why: "call isDemoModeAllowed" },
  { re: /\bassertDemoMode\s*\(/, why: "call assertDemoMode" },
  { re: /\bsetDemoClock\s*\(/, why: "call setDemoClock" },
  { re: /\badvanceDemoClock\s*\(/, why: "call advanceDemoClock" },
  { re: /\bresetDemoClock\s*\(/, why: "call resetDemoClock" },
  { re: /\bisDemoClockActive\s*\(/, why: "call isDemoClockActive" },
  { re: /\bseedDemoApprovalActors\s*\(/, why: "call seedDemoApprovalActors" },
  { re: /from\s+["'][^"']*demo-clock[^"']*["']/, why: "import demo-clock" },
  { re: /["']demo:reset["']/, why: "demo:reset script key" },
  { re: /aegis\.(post|get)\(\s*["']\/demo\/(scenarios|simulator)/, why: "register demo HTTP route" },
];

function isIgnoredPath(rel) {
  const n = rel.replace(/\\/g, "/");
  if (n === "tools/scripts/no-demo-mode-reintro.mjs") return true;
  if (n.includes("node_modules/")) return true;
  if (n.includes("/dist/") || n.startsWith("dist/")) return true;
  if (n.includes("/.next/") || n.startsWith(".next/")) return true;
  if (n.includes(".cursor-test-compare/")) return true;
  if (n.startsWith("docs/")) return true;
  if (n.startsWith("tmp/")) return true; // local scratch; not shipped
  if (n.endsWith("production-guards.ts")) return true;
  if (n.endsWith("services/aegis-api/src/index.ts")) return true;
  if (n.endsWith("services/aegis-api/src/time/clock.ts")) return true;
  if (
    /services\/aegis-api\/test\/(production-guards|production-demo-routes|removed-demo-endpoints|clock)\.test\.ts$/.test(
      n,
    )
  ) {
    return true;
  }
  return false;
}

const SCAN_EXT = /\.(ts|tsx|js|mjs|mts|cjs|json|yml|yaml|ps1|sh)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".cursor-test-compare", "dist", ".next", "tmp"]);

/** Pure-Node fallback when `rg` is not installed (same files, same "path:line:text" output). */
function nodeGrep(pattern) {
  const re = new RegExp(pattern);
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(abs);
      } else if (e.isFile() && SCAN_EXT.test(e.name)) {
        if (statSync(abs).size > 2_000_000) continue;
        const lines = readFileSync(abs, "utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            hits.push(`./${relative(root, abs).replace(/\\/g, "/")}:${i + 1}:${lines[i]}`);
          }
        }
      }
    }
  };
  walk(root);
  return hits;
}

function ripgrep(pattern) {
  try {
    const out = execFileSync(
      "rg",
      [
        "-n",
        "--glob",
        "!**/node_modules/**",
        "--glob",
        "!**/.git/**",
        "--glob",
        "!**/.cursor-test-compare/**",
        "--glob",
        "!**/dist/**",
        "--glob",
        "!**/.next/**",
        "--glob",
        "!tmp/**",
        "-g",
        "*.{ts,tsx,js,mjs,mts,cjs,json,yml,yaml,ps1,sh}",
        pattern,
        ".",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return out.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    if (err && err.status === 1) return [];
    if (err && err.code === "ENOENT") return nodeGrep(pattern);
    throw err;
  }
}

const failures = [];

for (const frag of FORBIDDEN_PATHS) {
  const p = join(root, frag);
  if (existsSync(p)) failures.push(`forbidden path exists: ${frag}`);
}

for (const { re, why } of FORBIDDEN_CALLS) {
  const lines = ripgrep(re.source);
  for (const line of lines) {
    const file = line.split(":")[0] ?? "";
    const rel = file.replace(/^\.[\\/]/, "").replace(/\\/g, "/");
    if (isIgnoredPath(rel)) continue;
    failures.push(`${why}: ${line}`);
  }
}

// Enabling assignment of AEGIS_DEMO_MODE to a truthy value (not comments, not "false").
{
  const lines = ripgrep(String.raw`AEGIS_DEMO_MODE\s*[=:]\s*["']?(true|1|yes|on)["']?`);
  for (const line of lines) {
    const file = line.split(":")[0] ?? "";
    const rel = file.replace(/^\.[\\/]/, "").replace(/\\/g, "/");
    if (isIgnoredPath(rel)) continue;
    // Tests that assert production refuse may set true inside a goodEnv() call — allow test/
    if (rel.includes("/test/") || rel.includes("\\test\\")) continue;
    failures.push(`enabling AEGIS_DEMO_MODE assignment: ${line}`);
  }
}

if (failures.length) {
  console.error("FAIL no-demo-mode-reintro:");
  for (const f of failures.slice(0, 80)) console.error(`  ${f}`);
  if (failures.length > 80) console.error(`  … +${failures.length - 80} more`);
  process.exit(1);
}

console.log(
  "OK no-demo-mode-reintro (forbidden APIs/paths absent outside allow-list)",
);
