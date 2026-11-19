#!/usr/bin/env node
/**
 * pnpm demo:connectors
 *
 * Starts one Aegis Connector process per Demo Bank source (LOS :8787, Core :8788,
 * Pay :8789) using keys provisioned under `.data/connectors/` (gitignored).
 *
 * Needs:
 *   AEGIS_INGEST_KEY or DEMO_BANK_INGEST_KEY
 *   and a prior `pnpm pilot:provision-demo-tenant` (or demo:fresh) so public keys
 *   are registered and private keys exist locally.
 *
 * bank:up also embeds in-process Connectors inside the bank-simulator; use this
 * helper when you want standalone HTTP Connectors (`POST http://127.0.0.1:8787/events`).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
    }
  }
}

loadEnvFiles();

const connectorsDir = resolve(
  process.env.AEGIS_CONNECTORS_DIR?.trim() || join(root, ".data", "connectors"),
);
const ingest =
  process.env.AEGIS_INGEST_BEARER?.trim() ||
  process.env.AEGIS_INGEST_KEY?.trim() ||
  process.env.DEMO_BANK_INGEST_KEY?.trim() ||
  "";
const cli = join(root, "packages/aegis-connector/dist/cli.js");

const SOURCES = [
  { source_id: "src_los", port: 8787 },
  { source_id: "src_core", port: 8788 },
  { source_id: "src_pay", port: 8789 },
];

function die(msg) {
  console.error(`\n  demo:connectors: ${msg}\n`);
  process.exit(1);
}

if (!existsSync(cli)) {
  die("aegis-connector not built. Run: pnpm --filter @salanor/aegis-connector build");
}
if (!ingest) {
  die("Set AEGIS_INGEST_KEY (or DEMO_BANK_INGEST_KEY / AEGIS_INGEST_BEARER).");
}
if (!existsSync(connectorsDir)) {
  die(
    `Missing ${connectorsDir}. Run: pnpm pilot:provision-demo-tenant  (or pnpm demo:fresh)`,
  );
}

function waitPort(port, host = "127.0.0.1", ms = 20_000) {
  const start = Date.now();
  return new Promise((resolveOk, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host }, () => {
        sock.end();
        resolveOk(true);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > ms) reject(new Error(`timeout waiting for ${host}:${port}`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

const logDir = join(connectorsDir, "logs");
mkdirSync(logDir, { recursive: true });
const pids = [];

console.log("\n  demo:connectors — starting Aegis Connectors\n");
console.log(`  keys: ${connectorsDir}`);

for (const src of SOURCES) {
  const config = join(connectorsDir, src.source_id, "aegis-connector.config.json");
  const keyFile = join(connectorsDir, src.source_id, "private.key");
  if (!existsSync(config) || !existsSync(keyFile)) {
    console.warn(`  skip ${src.source_id}: missing config or private.key (re-run provision)`);
    continue;
  }
  const out = openSync(join(logDir, `${src.source_id}.log`), "a");
  const child = spawn(process.execPath, [cli, "start", "--config", config], {
    cwd: join(connectorsDir, src.source_id),
    env: {
      ...process.env,
      AEGIS_INGEST_BEARER: ingest,
    },
    stdio: ["ignore", out, out],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  pids.push({ source_id: src.source_id, port: src.port, pid: child.pid });
  try {
    await waitPort(src.port);
    console.log(`  ${src.source_id}  http://127.0.0.1:${src.port}  (pid ${child.pid})`);
  } catch (err) {
    console.warn(
      `  ${src.source_id}  did not bind :${src.port} (${err instanceof Error ? err.message : err})`,
    );
  }
}

writeFileSync(
  join(connectorsDir, "demo-connectors.pids.json"),
  JSON.stringify({ started_at: new Date().toISOString(), processes: pids }, null, 2),
);

console.log("\n  POST plain events to http://127.0.0.1:8787/events (LOS)");
console.log("  bank-simulator embeds its own in-process Connectors; this is optional.");
console.log("  Stop: kill the pids in .data/connectors/demo-connectors.pids.json\n");
process.exit(pids.length ? 0 : 1);
