#!/usr/bin/env node
/**
 * Cross-platform pytest launcher. Prefers `py` on Windows (avoids the Store stub)
 * and `python3` elsewhere. Collects only this package's tests/ (never repo tmp/).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const testsDir = existsSync(resolve(cwd, "tests")) ? "tests" : ".";
const extraArgs = process.argv.slice(2);
const defaultArgs =
  extraArgs.length > 0
    ? extraArgs
    : [testsDir, "--ignore=../../tmp", "--ignore=tmp", "-q"];

const candidates =
  process.platform === "win32"
    ? [
        ["py", ["-3", "-m", "pytest"]],
        ["py", ["-m", "pytest"]],
        ["python", ["-m", "pytest"]],
      ]
    : [
        ["python3", ["-m", "pytest"]],
        ["python", ["-m", "pytest"]],
      ];

let last = null;
for (const [bin, args] of candidates) {
  const result = spawnSync(bin, [...args, ...defaultArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
    cwd,
  });
  last = result;
  if (result.error && result.error.code === "ENOENT") {
    continue;
  }
  process.exit(result.status ?? 1);
}

console.error(
  "Python was not found. Install Python 3 and ensure `py` (Windows) or `python3` is on PATH.",
);
process.exit(last?.status ?? 1);
