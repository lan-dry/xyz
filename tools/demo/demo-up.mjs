#!/usr/bin/env node
/**
 * One-command forensic demo bring-up (presenting org: Demo Bank).
 *
 * Starts Postgres (docker), migrates, ensures the Demo Bank org (4 agents with
 * signing keys, admin@demo.test, ingest key), applies the banking pack with
 * demo approvers, resets cases, seeds ~8 historical RWF cases, starts the API,
 * a 10s-cadence witness worker, and the console as a PRODUCTION build
 * (`next start`, no dev overlay), then warms the main pages.
 *
 * Requires: AEGIS_DEMO_MODE=true (forced), AEGIS_DEMO_APPROVAL_PASSWORD
 * (min 10 chars). No default password.
 *
 * Flags / env:
 *   --no-story            skip demo:seed-story (DEMO_SKIP_STORY=1)
 *   --skip-build          reuse existing console .next build (DEMO_SKIP_BUILD=1)
 *   --with-northwind      also apply the Northwind pilot fixture
 *                         (DEMO_WITH_NORTHWIND=1; tests/legacy only)
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...opts.env },
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

/** Run a command, echo its output, and also return it (for parsing markers). */
function capture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, ...opts.env },
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

/** Docker container state without leaking `docker inspect` output to the console. */
function dockerContainerState(name) {
  try {
    const out = execFileSync(
      "docker",
      ["inspect", "-f", "{{.State.Running}}", name],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out === "true" ? "running" : "stopped";
  } catch {
    return "missing";
  }
}

/** Kill stale processes whose command line matches a pattern (Windows + Unix). */
function killByCommandLine(pattern) {
  try {
    if (process.platform === "win32") {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match '${pattern}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore" },
      );
    } else {
      execFileSync("sh", ["-c", `pkill -f '${pattern}' || true`], {
        stdio: "ignore",
      });
    }
  } catch {
    /* ignore */
  }
}

/** Fetch with a hard timeout; returns the Response or throws. */
async function fetchTimeout(url, init = {}, ms = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Warm the main console pages so the first click on stage is instant.
 * Logs in as the demo admin (best effort) so authenticated pages render.
 */
async function warmConsole({ consoleBase, apiBase, password }) {
  let cookie = "";
  try {
    const res = await fetchTimeout(`${apiBase}/v1/console/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@demo.test", password }),
    });
    if (res.ok) {
      const set = res.headers.getSetCookie?.() ?? [];
      cookie = set.map((c) => c.split(";")[0]).join("; ");
    }
  } catch {
    /* warm unauthenticated */
  }
  const paths = [
    "/aegis",
    "/aegis/live",
    "/aegis/approvals",
    "/aegis/policies",
    "/aegis/verify",
    "/aegis/demo/simulator",
  ];
  console.log(`Warming console pages${cookie ? " (admin session)" : ""}…`);
  for (const p of paths) {
    const started = Date.now();
    try {
      const res = await fetchTimeout(
        `${consoleBase}${p}`,
        { headers: cookie ? { Cookie: cookie } : {}, redirect: "follow" },
      );
      await res.arrayBuffer();
      console.log(`  ${res.status} ${p} (${Date.now() - started}ms)`);
    } catch (err) {
      console.warn(
        `  warm failed ${p}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function bg(cmd, args, logLabel) {
  // Detach so demo:up can exit while API/console keep running (otherwise
  // the parent waits forever and chained `pnpm demo:rehearse` never starts).
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "ignore",
    shell: true,
    env: process.env,
    detached: true,
    windowsHide: true,
  });
  child.unref();
  child.on("error", (err) => {
    console.error(`[demo:up] ${logLabel} spawn error:`, err.message);
  });
  return child;
}

async function waitHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** True if URL answers quickly (reuse already-running demo processes). */
async function isHttpUp(url, timeoutMs = 1500) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Free a localhost port held by a stale node/demo process (Windows + Unix). */
function freePort(port) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
        ],
        { encoding: "utf8" },
      ).trim();
      const pids = out
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s) && s !== "0");
      for (const pid of pids) {
        try {
          execFileSync("taskkill", ["/PID", pid, "/T", "/F"], {
            stdio: "ignore",
          });
          console.log(`Freed :${port} (killed pid ${pid})`);
        } catch {
          /* ignore */
        }
      }
    } else {
      const out = execFileSync(
        "sh",
        ["-c", `lsof -tiTCP:${port} -sTCP:LISTEN || true`],
        { encoding: "utf8" },
      ).trim();
      for (const pid of out.split(/\s+/).filter(Boolean)) {
        try {
          process.kill(Number(pid), "SIGTERM");
          console.log(`Freed :${port} (killed pid ${pid})`);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function ensureService({
  name,
  port,
  healthUrls,
  start,
  waitAttempts = 60,
  /** Always free + restart so process env matches demo DATABASE_URL. */
  forceRestart = false,
}) {
  if (!forceRestart) {
    for (const url of healthUrls) {
      if (await isHttpUp(url)) {
        console.log(`Reusing ${name} already healthy on :${port}`);
        return;
      }
    }
  }
  if (forceRestart || (await isPortListening(port))) {
    console.log(
      forceRestart
        ? `Restarting ${name} on :${port} with demo DATABASE_URL…`
        : `${name} port :${port} is in use but not healthy — freeing it…`,
    );
    freePort(port);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Starting ${name} on :${port}…`);
  start();
  let lastErr;
  for (const url of healthUrls) {
    try {
      await waitHttp(url, waitAttempts);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
}

async function main() {
  loadDotEnv();
  const argv = process.argv.slice(2);
  const skipStory =
    argv.includes("--no-story") || process.env.DEMO_SKIP_STORY === "1";
  const skipBuild =
    argv.includes("--skip-build") || process.env.DEMO_SKIP_BUILD === "1";
  const withNorthwind =
    argv.includes("--with-northwind") || process.env.DEMO_WITH_NORTHWIND === "1";
  process.env.AEGIS_DEMO_MODE = "true";
  if (process.env.NODE_ENV === "production" || process.env.AEGIS_ENV === "production") {
    console.error("Refusing demo:up in production NODE_ENV/AEGIS_ENV");
    process.exit(1);
  }
  const pass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
  if (!pass || pass.length < 10) {
    console.error(
      "Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars). No default is provided.",
    );
    process.exit(1);
  }

  const dbUrl =
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_URL_UNPOOLED = dbUrl;
  process.env.AEGIS_API_PORT = process.env.AEGIS_API_PORT || "8080";
  process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64;
  process.env.AEGIS_RECEIPT_KEY_ID =
    process.env.AEGIS_RECEIPT_KEY_ID || "receipt_dev";
  // Server-side HTTP approval runners call intake with this key.
  process.env.AEGIS_INGEST_KEY =
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim() ||
    "";
  if (!process.env.AEGIS_INGEST_KEY) {
    console.error(
      "Set AEGIS_INGEST_KEY or AEGIS_INGEST_DEV_KEY in .env (needed for demo HTTP approvals).",
    );
    process.exit(1);
  }
  // Demo-only: force high ceilings even when .env has LOGIN_RATE_LIMIT=20.
  process.env.LOGIN_RATE_LIMIT = "100000";
  process.env.LOGIN_RATE_WINDOW_MS = "900000";
  process.env.INGEST_RATE_LIMIT_PER_MIN = "100000";

  console.log("== demo:up ==");
  console.log(`DATABASE_URL=${dbUrl.replace(/:[^:@]+@/, ":***@")}`);

  // Single Postgres container: named volume + healthcheck (compose file).
  // Prefer compose so recreates keep the volume; fall back to start/create.
  const pgState = dockerContainerState("aegis-pg-demo");
  if (pgState === "running") {
    console.log("Postgres aegis-pg-demo already running on :5435");
  } else if (pgState === "stopped") {
    console.log("Starting existing aegis-pg-demo container…");
    await run("docker", ["start", "aegis-pg-demo"]);
  } else {
    console.log("Starting aegis-pg-demo via compose (named volume + healthcheck)…");
    await run("docker", [
      "compose",
      "-f",
      "deploy/docker/docker-compose.postgres-demo.yml",
      "up",
      "-d",
    ]);
  }
  // Wait until healthy (or 60s). Do not loop forever if Docker is wedged.
  let healthy = false;
  for (let i = 0; i < 12; i++) {
    try {
      const out = execFileSync(
        "docker",
        [
          "inspect",
          "--format",
          "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
          "aegis-pg-demo",
        ],
        { encoding: "utf8", timeout: 8000 },
      ).trim();
      console.log(`Postgres health: ${out}`);
      if (out === "healthy" || out === "running") {
        healthy = out === "healthy" || i >= 2;
        if (out === "healthy") break;
      }
    } catch {
      console.warn("Postgres health check failed (Docker may be down).");
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!healthy) {
    console.error(
      "Postgres aegis-pg-demo is not healthy. Fix Docker Desktop, then:\n" +
        "  docker compose -f deploy/docker/docker-compose.postgres-demo.yml up -d",
    );
    process.exit(1);
  }

  await run("pnpm", ["--filter", "aegis-api", "db:migrate"]);

  // Northwind (pilot fixture) is kept for tests / legacy flows only. It never
  // becomes the presenting org, and it runs BEFORE the Demo Bank fixture so
  // Demo Bank's ingest key wins if both share the same dev key hash.
  if (withNorthwind) {
    await run("pnpm", ["--filter", "aegis-api", "db:local:pilot-fixture"]).catch(
      () => console.warn("pilot-fixture skipped (no bootstrap account yet?)"),
    );
  }

  // Presenting org: Demo Bank (slug demo-bank). Always override any stale
  // AEGIS_ORGANIZATION_ID from .env / the shell.
  const fixtureOut = await capture("pnpm", [
    "--filter",
    "aegis-api",
    "db:demo-bank-fixture",
  ]);
  const orgMatch = fixtureOut.match(/DEMO_ORG_ID=([0-9a-f-]{36})/i);
  if (!orgMatch) {
    throw new Error("Demo Bank fixture did not report DEMO_ORG_ID");
  }
  const org = orgMatch[1];
  process.env.AEGIS_ORGANIZATION_ID = org;
  const orgName = "Demo Bank";

  // Presenter UI profile (server + build-time public flag).
  process.env.AEGIS_UI_PROFILE = "bank_demo";
  process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE = "bank_demo";
  // F13: gate/evidence record failure → 503 for policy evaluate in demo.
  process.env.AEGIS_ENFORCE_REQUIRE_EVIDENCE = "1";
  // Witness cadence: batch roots every 10s so Verify shows fresh checkpoints.
  process.env.WITNESS_INTERVAL_MS = process.env.WITNESS_INTERVAL_MS || "10000";

  await run("pnpm", [
    "--filter",
    "aegis-api",
    "pack:apply",
    "--",
    "--pack",
    "banking",
    "--org",
    org,
    "--seed-approvers",
  ]);

  // Reset demo case/receipt state so demo:up always starts clean.
  await run("pnpm", [
    "--filter",
    "aegis-api",
    "demo:reset",
    "--",
    "--org",
    org,
    "--keep-pack",
  ]);

  process.env.NEXT_PUBLIC_AEGIS_API_URL =
    process.env.NEXT_PUBLIC_AEGIS_API_URL || "http://localhost:8080";

  // Console = PRODUCTION build (`next start`), never `next dev`: no Next.js
  // dev "N" badge / overlay on stage. NEXT_PUBLIC_* are inlined at build, so
  // the env above must be set first. Free :3000 first (a running dev/start
  // server would hold/corrupt .next).
  if (skipBuild) {
    console.log("Skipping console build (--skip-build) — reusing .next");
  } else {
    console.log("Building web-console (production)…");
    freePort(3000);
    await run("pnpm", ["--filter", "@salanor/web-console", "build"]);
  }

  const apiPort = Number(process.env.AEGIS_API_PORT || "8080");
  // Always restart API so it uses the demo DB (:5435), not a reused process
  // still bound to .env Neon/:5432 — otherwise export reads empty receipts.
  await ensureService({
    name: "aegis-api",
    port: apiPort,
    forceRestart: true,
    healthUrls: [
      `http://localhost:${apiPort}/health`,
      `http://localhost:${apiPort}/`,
    ],
    start: () =>
      bg(
        "pnpm",
        ["--filter", "aegis-api", "exec", "tsx", "src/index.ts"],
        "api",
      ),
  });

  // Historical RWF cases (all holds resolved → pending queue empty).
  if (skipStory) {
    console.log("Skipping demo:seed-story (--no-story)");
  } else {
    await run("pnpm", ["--filter", "aegis-api", "demo:seed-story"], {
      env: { AEGIS_API_BASE: `http://localhost:${apiPort}` },
    }).catch((err) =>
      console.warn(
        "demo:seed-story failed (presenting org may be empty):",
        err instanceof Error ? err.message : err,
      ),
    );
  }

  // Witness worker on a short cadence (restart so it uses the demo DB/env).
  killByCommandLine("witness:worker|witness.worker-cli");
  console.log(
    `Starting witness worker (every ${process.env.WITNESS_INTERVAL_MS}ms)…`,
  );
  bg("pnpm", ["--filter", "aegis-api", "witness:worker"], "witness-worker");

  await ensureService({
    name: "web-console (production build)",
    port: 3000,
    healthUrls: ["http://localhost:3000"],
    waitAttempts: 60,
    // Always restart: a reused process may be `next dev` or a stale build.
    forceRestart: true,
    start: () =>
      bg("pnpm", ["--filter", "@salanor/web-console", "start"], "console"),
  })
    .then(() =>
      warmConsole({
        consoleBase: "http://localhost:3000",
        apiBase: `http://localhost:${apiPort}`,
        password: pass,
      }),
    )
    .catch((err) =>
      console.warn(
        "web-console not ready yet (API is up):",
        err instanceof Error ? err.message : err,
      ),
    );

  console.log(`
========================================
Demo is up (AEGIS_DEMO_MODE=true, AEGIS_UI_PROFILE=bank_demo)
  API:     http://localhost:8080
  Console: http://localhost:3000/aegis
  Org:     ${orgName}  (${org})
  Witness: batching every ${Number(process.env.WITNESS_INTERVAL_MS) / 1000}s

Demo logins (password = AEGIS_DEMO_APPROVAL_PASSWORD from your env):
  admin@demo.test     (admin — console owner)
  officer@demo.test   (credit_officer)
  manager@demo.test   (credit_manager)
  comp@demo.test      (compliance_officer)
  head@demo.test      (head_of_compliance)
  dpo@demo.test       (dpo)

Next:
  pnpm demo:rehearse     (uses scratch org demo-bank-rehearsal; presenting org stays clean)
  pnpm demo:reset -- --keep-pack   (wipe Demo Bank cases, keep the pack)
  pnpm demo:seed-story             (re-seed history after a reset)
========================================
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
