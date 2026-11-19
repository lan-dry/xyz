#!/usr/bin/env node
/**
 * pnpm bank:up — start the Stage 8 multi-system bank test environment.
 *
 * Tries Docker for bank-core Postgres (wal_level=logical). If Docker is
 * unstable or unavailable, continues with an in-memory ledger and reports Partial.
 * Starts: bank-simulator (:4000) and demo-bureau (:4100) as Node processes.
 * The simulator embeds in-process Aegis Connectors (Stage 1b) using keys under
 * `.data/connectors/` when provisioned. Optional standalone HTTP Connectors:
 * `pnpm demo:connectors`.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, ".bank-simulator");
const pidFile = join(dataDir, "bank-up.pids.json");
const logDir = join(dataDir, "logs");

mkdirSync(logDir, { recursive: true });

function waitPort(port, host = "127.0.0.1", ms = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host }, () => {
        sock.end();
        resolve(true);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > ms) reject(new Error(`timeout waiting for ${host}:${port}`));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function tryDocker() {
  const compose = join(here, "docker-compose.bank.yml");
  try {
    // Quick probe — if the daemon is wedged, do not hang bank:up.
    execFileSync("docker", ["info"], {
      cwd: root,
      stdio: "ignore",
      timeout: 8_000,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `docker info failed/timeout: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    execFileSync("docker", ["compose", "-f", compose, "up", "-d"], {
      cwd: root,
      stdio: "inherit",
      timeout: 60_000,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function spawnLogged(name, command, args, env = {}) {
  const out = openSync(join(logDir, `${name}.log`), "a");
  // Detach on all platforms so processes survive after bank:up exits (esp. Windows job control).
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", out, out],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  return { name, pid: child.pid, command: [command, ...args].join(" ") };
}

const status = {
  docker: null,
  postgres: "skipped",
  bank_simulator: null,
  demo_bureau: null,
  partials: [],
};

console.log("\n  bank:up — Stage 8 multi-system bank\n");

const docker = tryDocker();
status.docker = docker.ok ? "up" : "failed";
if (!docker.ok) {
  status.partials.push(
    `Docker bank-core Postgres not started (${docker.reason}). Using in-memory ledger.`,
  );
  console.warn("  Partial: Docker unavailable/unstable — memory ledger only.");
  console.warn("  ", docker.reason);
} else {
  try {
    await waitPort(5436, "127.0.0.1", 45_000);
    status.postgres = "ready :5436";
    process.env.BANK_CORE_DATABASE_URL ||=
      "postgresql://salanor:salanor@127.0.0.1:5436/bank_core";
    console.log("  Postgres bank-core healthy on :5436 (wal_level=logical)");
  } catch (err) {
    status.postgres = "unhealthy";
    status.partials.push(
      `Postgres on :5436 did not become ready (${err.message}). Memory ledger.`,
    );
    console.warn("  Partial: Postgres not ready — memory ledger.");
    delete process.env.BANK_CORE_DATABASE_URL;
  }
}

const bureau = spawnLogged("demo-bureau", "node", [join(root, "tools/demo-bureau/server.mjs")], {
  PORT: "4100",
  HOST: "127.0.0.1",
});
status.demo_bureau = bureau;

const simEnv = {
  PORT: "4000",
  HOST: "127.0.0.1",
  DEMO_BUREAU_URL: "http://127.0.0.1:4100",
  BANK_SIMULATOR_DATA_DIR: dataDir,
};
if (process.env.BANK_CORE_DATABASE_URL) {
  simEnv.BANK_CORE_DATABASE_URL = process.env.BANK_CORE_DATABASE_URL;
}
if (process.env.AEGIS_API_BASE) simEnv.AEGIS_API_BASE = process.env.AEGIS_API_BASE;
if (process.env.AEGIS_INGEST_KEY) simEnv.AEGIS_INGEST_KEY = process.env.AEGIS_INGEST_KEY;
if (process.env.AEGIS_ORGANIZATION_ID) {
  simEnv.AEGIS_ORGANIZATION_ID = process.env.AEGIS_ORGANIZATION_ID;
}

const sim = spawnLogged("bank-simulator", "node", [join(here, "server.mjs")], simEnv);
status.bank_simulator = sim;

try {
  await waitPort(4100);
  console.log("  demo-bureau on http://127.0.0.1:4100");
} catch {
  status.partials.push("demo-bureau did not bind :4100");
}
try {
  await waitPort(4000);
  // Ensure this is the Stage 8 process, not a leftover pre-Stage-8 simulator.
  const rt = await fetch("http://127.0.0.1:4000/api/redteam", {
    signal: AbortSignal.timeout(3000),
  });
  if (!rt.ok) {
    status.partials.push(
      `port :4000 answered but /api/redteam → HTTP ${rt.status} (stop the old simulator and re-run bank:up)`,
    );
  } else {
    console.log("  bank-simulator on http://127.0.0.1:4000 (Stage 8 Red Team API ok)");
  }
} catch (err) {
  status.partials.push(
    `bank-simulator did not become Stage-8 ready: ${err instanceof Error ? err.message : err}`,
  );
}

writeFileSync(pidFile, JSON.stringify({ ...status, started_at: new Date().toISOString() }, null, 2));

console.log("\n  Staff UI:     http://127.0.0.1:4000  (systems + red team panels)");
console.log("  Bureau:       http://127.0.0.1:4100");
console.log("  Stop with:    pnpm bank:down");
if (status.partials.length) {
  console.log("\n  Partials:");
  for (const p of status.partials) console.log("   -", p);
}
console.log("");
process.exit(status.partials.some((p) => p.includes("did not bind")) ? 1 : 0);
