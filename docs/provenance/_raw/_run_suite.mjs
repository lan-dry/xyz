import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const partsDir = path.join(root, "docs/provenance/_raw/final_suite_parts");
const suiteTmp = path.join(root, "tmp", "suite");
fs.mkdirSync(partsDir, { recursive: true });
fs.mkdirSync(suiteTmp, { recursive: true });

const env = {
  ...process.env,
  TEMP: suiteTmp,
  TMP: suiteTmp,
  TMPDIR: suiteTmp,
};

function run(name, command, opts = {}) {
  const outPath = path.join(partsDir, `${name}.txt`);
  console.log(`\n===== START ${name} =====`);
  const started = Date.now();
  const res = spawnSync(command, {
    cwd: root,
    env,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  const elapsed = Date.now() - started;
  const body = [
    `$ ${command}`,
    "",
    res.stdout || "",
    res.stderr || "",
    "",
    `EXIT=${res.status ?? "null"} ELAPSED_MS=${elapsed}`,
  ].join("\n");
  fs.writeFileSync(outPath, body);
  console.log(`===== END ${name} EXIT=${res.status} (${elapsed}ms) =====`);
  return { name, exit: res.status ?? 1, elapsed, outPath };
}

const results = [];

// 1) aegis-api vitest full
results.push(run("aegis-api-test", "pnpm --filter aegis-api exec vitest run"));

// 2) typechecks
results.push(
  run("aegis-api-typecheck", "pnpm --filter aegis-api exec tsc --noEmit -p tsconfig.json"),
);
results.push(
  run(
    "web-console-typecheck",
    'pnpm --filter @salanor/web-console exec tsc --noEmit -p tsconfig.json',
  ),
);

// 3) lint
results.push(run("aegis-api-lint", "pnpm --filter aegis-api exec eslint ."));
results.push(
  run("web-console-lint", "pnpm --filter @salanor/web-console exec eslint ."),
);

// 4) builds — stop :3000 before next build so .next is not corrupted mid-write
results.push(run("aegis-api-build", "pnpm --filter aegis-api run build"));
results.push(
  run(
    "web-console-build",
    'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }; Start-Sleep 2; if (Test-Path apps/web-console/.next) { Remove-Item -Recurse -Force apps/web-console/.next }; pnpm --filter @salanor/web-console run build"',
    { timeout: 600_000 },
  ),
);

// 5) conformance
results.push(run("conformance-src1", "pnpm conformance:src1"));

// 6) gitleaks — scan committed tree only (not local .env / connector state)
const gitleaksBin = path.join(root, ".tools/gitleaks/gitleaks.exe");
const committedScan = path.join(root, "tmp", "committed-tree-scan");
const committedZip = path.join(root, "tmp", "committed-tree.zip");
fs.rmSync(committedScan, { recursive: true, force: true });
fs.rmSync(committedZip, { force: true });
fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
const archive = spawnSync("git", ["archive", "--format=zip", "-o", committedZip, "HEAD"], {
  cwd: root,
  encoding: "utf8",
});
if (archive.status !== 0) {
  console.error(archive.stderr || archive.stdout);
  process.exit(1);
}
const expand = spawnSync(
  "powershell",
  ["-NoProfile", "-Command", `Expand-Archive -Path '${committedZip}' -DestinationPath '${committedScan}' -Force`],
  { cwd: root, encoding: "utf8" },
);
if (expand.status !== 0) {
  console.error(expand.stderr || expand.stdout);
  process.exit(1);
}
const gitleaksCmd = fs.existsSync(gitleaksBin)
  ? `"${gitleaksBin}" detect --no-git --config=.gitleaks.toml --source="${committedScan}"`
  : `gitleaks detect --no-git --config=.gitleaks.toml --source="${committedScan}"`;
results.push(run("gitleaks-tree", gitleaksCmd));

// 7) bundle verifies
results.push(
  run(
    "aegis-verify",
    'pnpm aegis-verify "docs/TEST_PACK/provenance/bundles/g1-exported-bundle.json"',
  ),
);
results.push(
  run(
    "python-verify",
    'py -3 tools/independent-verify/verify_bundle.py --bundle "docs/TEST_PACK/provenance/bundles/g1-exported-bundle.json"',
  ),
);

// 8) demo runbook walk — start production console from the suite build, then walk
results.push(
  run("demo-runbook-walk", "node docs/provenance/_raw/_bounce_web_and_runbook.mjs", {
    timeout: 900_000,
  }),
);

function verdict(r) {
  if (r.exit === 0) return "PASS";
  return "FAIL";
}

const summaryLines = [
  "Provenance final suite",
  `Date: ${new Date().toISOString()}`,
  `Branch: feature/provenance`,
  `TEMP redirected to: ${suiteTmp} (C: was near full)`,
  "",
  "Command | Result | Exit | Elapsed_ms | Artifact",
  "--- | --- | --- | --- | ---",
];

for (const r of results) {
  summaryLines.push(
    `${r.name} | ${verdict(r)} | ${r.exit} | ${r.elapsed} | final_suite_parts/${r.name}.txt`,
  );
}

const fails = results.filter((r) => r.exit !== 0);
summaryLines.push("");
summaryLines.push(
  fails.length === 0
    ? "OVERALL: PASS"
    : `OVERALL: FAIL (${fails.length} failing: ${fails.map((f) => f.name).join(", ")})`,
);
summaryLines.push("");
summaryLines.push("=== concatenated exit markers ===");
for (const r of results) {
  summaryLines.push(`EXIT_${r.name}=${r.exit} ELAPSED_MS=${r.elapsed}`);
}

fs.writeFileSync(
  path.join(root, "docs/provenance/_raw/final_suite.txt"),
  summaryLines.join("\n") + "\n",
);

console.log("\n" + summaryLines.join("\n"));
process.exit(fails.length ? 1 : 0);
