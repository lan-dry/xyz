/**
 * Start all local dev servers without Nx batching web-platform behind aegis-api.
 * Web apps (3000–3003) and APIs (8080, 8091, …) run in parallel process groups.
 */
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const runner = isWin ? "pnpm.cmd" : "pnpm";

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function runNx(args, label) {
  const child = spawn(runner, ["exec", "nx", ...args], {
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev:${label}] exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });
  children.push(child);
  return child;
}

console.log("[dev] Starting web apps (3000–3003) and APIs (8080, 8091, …)\n");

runNx(
  [
    "run-many",
    "-t",
    "dev",
    "--projects=@salanor/web-console,@salanor/web-docs,@salanor/web-marketing,@salanor/web-platform",
    "--parallel=4",
  ],
  "web",
);

runNx(
  ["run-many", "-t", "dev", "--projects=aegis-api,id,insurance-api", "--parallel=3"],
  "api",
);

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
