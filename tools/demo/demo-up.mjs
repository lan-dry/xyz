#!/usr/bin/env node
/**
 * One-command LOCAL bring-up of the Demo Bank stack (presenting org: Demo Bank, slug demo-bank).
 *
 * Everything here runs the same code and the same commands as production. There is no demo
 * mode, no demo clock and no in-console simulator:
 *
 *   1. Postgres        docker compose (aegis-pg-demo on :5435)
 *   2. Migrate         pnpm --filter aegis-api db:migrate
 *   3. Services        Salanor ID (:8091) and a NORMAL aegis-api (:8080), both on the local DB
 *   4. Demo Bank       pnpm pilot:provision-demo-tenant   (is_demo org, 4 agents, ingest key,
 *                      banking pack with the 2-minute escalation, 6 personas + deputy)
 *                      pnpm pilot:seed-history            (11 cases through the real intake)
 *                      With --fresh: pnpm demo:fresh instead (wipe -> provision -> seed)
 *   5. Witness worker  10s cadence, so Verify shows fresh checkpoints
 *   6. Console         PRODUCTION build (`next start`, no dev overlay), pages warmed
 *
 * The provisioning CLIs read a tenant file (emails + passwords). For the local stack this script
 * writes a gitignored one (.demo-tenant-local-stack.local.json) whose api_base / id_base are
 * loopback. Persona passwords are generated into that file (or reused if already present).
 * The hosted .demo-tenant-emails.local.json is never used here. If you set DEMO_TENANT_FILE
 * yourself, it must also point at a loopback api_base / id_base.
 *
 * Requires (shell or .env):
 *   PLATFORM_BOOTSTRAP_SECRET      secret the LOCAL Salanor ID uses to authorise provisioning
 *                                  (see .env.example). Never commit a real one.
 * Recommended: AEGIS_BRIDGE_MASTER_KEY (signing bridge: holds are not sealed without it).
 *
 * Refuses to run when NODE_ENV or AEGIS_ENV is production, or when the database is not loopback.
 *
 * Flags / env:
 *   --fresh               wipe Demo Bank first (demo:fresh). Needs AEGIS_ALLOW_TENANT_WIPE=1 in
 *                         YOUR SHELL (an .env file cannot supply it)
 *   --no-history          skip pilot:seed-history (DEMO_SKIP_HISTORY=1; --no-story is an alias)
 *   --skip-build          reuse the existing console .next build (DEMO_SKIP_BUILD=1)
 *   DEMO_DATABASE_URL     local Postgres URL (default postgresql://salanor:salanor@127.0.0.1:5435/aegis)
 *   DEMO_BANK_INGEST_KEY  stable local ingest key (>= 32 chars), honoured only when set in your
 *                         shell. Unset: a new throwaway key is generated per run and printed.
 *   DEMO_UI_PROFILE       set to bank_demo for the trimmed pitch console profile (default: normal)
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TENANT_FILE = ".demo-tenant-local-stack.local.json"; // gitignored: .demo-tenant-*.local.json
const ALLOW_WIPE_ENV = "AEGIS_ALLOW_TENANT_WIPE";

// Values the operator set in their own shell BEFORE .env is merged in. Two settings must never
// come from a (possibly production-flavoured) .env file.
const shellDemoBankKey = process.env.DEMO_BANK_INGEST_KEY?.trim() || "";
const shellAllowWipe = process.env[ALLOW_WIPE_ENV];

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = join(root, name);
    if (!existsSync(envPath)) continue;
    let text = readFileSync(envPath, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}

function die(message) {
  console.error(`\n  demo:up: ${message}\n`);
  process.exit(1);
}

function isLoopbackUrl(raw) {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
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
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

/** Run a command, echo its output, and also return it (for parsing the org id). */
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
 * Signs in as the Demo Bank admin through Salanor ID (best effort).
 */
async function warmConsole({ consoleBase, idBase, adminEmail, password }) {
  let cookie = "";
  try {
    const res = await fetchTimeout(`${idBase}/v1/id/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password }),
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

/** Long-lived children kept until demo:up finishes; then unref so the CLI can exit. */
const bgChildren = [];

function bg(cmd, args, logLabel) {
  // Do not use detached+ignore on Windows — the child often dies with an empty log.
  // Keep fds open to a log file; unref at the end so services outlive this CLI.
  const logDir = join(root, ".cursor-test-compare", "remove-demo-mode");
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const logPath = join(logDir, `demo-up-${logLabel}.log`);
  const out = openSync(logPath, "w");
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ["ignore", out, out],
    shell: true,
    env: process.env,
    windowsHide: true,
  });
  bgChildren.push(child);
  child.on("error", (err) => {
    console.error(`[demo:up] ${logLabel} spawn error:`, err.message);
  });
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(
        `[demo:up] ${logLabel} exited early code=${code} signal=${signal} (see ${logPath})`,
      );
    }
  });
  return child;
}

function releaseBgChildren() {
  for (const child of bgChildren) {
    try {
      child.unref();
    } catch {
      /* ignore */
    }
  }
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

/** True if URL answers quickly. */
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

/** Free a localhost port held by a stale node process (Windows + Unix). */
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
  /** Always free + restart so the process env matches the local DATABASE_URL. */
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
        ? `Restarting ${name} on :${port} with the local DATABASE_URL…`
        : `${name} port :${port} is in use but not healthy — freeing it…`,
    );
    freePort(port);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Starting ${name} on :${port}…`);
  start();
  // Give detached spawns a moment to bind before polling (tsx cold start on Windows).
  await new Promise((r) => setTimeout(r, 2500));
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

/** Personas of the LOCAL Demo Bank. Same password for all, written into the tenant file. */
const LOCAL_PERSONAS = {
  admin: { email: "admin@demo.test", display_name: "Demo Admin" },
  officer: { email: "officer@demo.test", display_name: "Demo Credit Officer" },
  manager: { email: "manager@demo.test", display_name: "Demo Credit Manager" },
  compliance: { email: "comp@demo.test", display_name: "Demo Compliance Officer" },
  head: { email: "head@demo.test", display_name: "Demo Head of Compliance" },
  dpo: { email: "dpo@demo.test", display_name: "Demo DPO" },
  deputy: { email: "deputy@demo.test", display_name: "Demo Deputy" },
};

/** Reuse the existing local-stack password when present; otherwise generate one into the tenant file. */
function resolveLocalPersonaPassword() {
  const existingPath = join(root, TENANT_FILE);
  if (existsSync(existingPath)) {
    try {
      const parsed = JSON.parse(readFileSync(existingPath, "utf8"));
      const prev = parsed?.personas?.admin?.password?.trim();
      if (prev && prev.length >= 10) return { password: prev, reused: true };
    } catch {
      /* regenerate */
    }
  }
  return { password: `local-${randomBytes(12).toString("base64url")}`, reused: false };
}

/** Writes the gitignored loopback tenant file used by provision / seed / demo:fresh. */
function writeLocalTenantFile({ apiBase, idBase, consoleOrigin, password, ingestKey }) {
  const personas = {};
  for (const [key, p] of Object.entries(LOCAL_PERSONAS)) {
    personas[key] = { ...p, password };
  }
  const file = {
    api_base: apiBase,
    id_base: idBase,
    console_origin: consoleOrigin,
    organization: { name: "Demo Bank", slug: "demo-bank" },
    personas,
    // Local-only ingest secret for bank-simulator / prove scripts (gitignored file).
    ...(ingestKey ? { ingest_key: ingestKey } : {}),
  };
  const path = join(root, TENANT_FILE);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  return path;
}

/** A user-supplied DEMO_TENANT_FILE is only accepted when it targets a loopback stack. */
function assertLoopbackTenantFile(path) {
  let raw = readFileSync(path, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    die(`${path} is not valid JSON.`);
  }
  const api = parsed.api_base ?? "";
  const id = parsed.id_base || api;
  if (!isLoopbackUrl(api) || !isLoopbackUrl(id)) {
    die(
      `${path} does not target a loopback stack (api_base=${api || "?"}, id_base=${id || "?"}). ` +
        "demo:up only provisions the LOCAL stack. Unset DEMO_TENANT_FILE to use the generated local file.",
    );
  }
  const slug = parsed.organization?.slug?.trim() || "demo-bank";
  if (slug !== "demo-bank") {
    die(`${path} has organization.slug "${slug}"; demo:up provisions "demo-bank".`);
  }
}

async function main() {
  loadDotEnv();
  // An .env file can never authorise a wipe, and never supplies the Demo Bank ingest key for
  // the local stack (that variable usually names the hosted tenant's key).
  if (shellAllowWipe === undefined) delete process.env[ALLOW_WIPE_ENV];
  // demo:up starts a normal API. Drop a stale flag from older shells so children never see it.
  const legacyFlag = "AEGIS_DEMO_MODE"; // removed: ignored if still set in an old shell
  if (process.env[legacyFlag] !== undefined) {
    console.warn(`${legacyFlag} is no longer used; ignoring it for this run.`);
    delete process.env[legacyFlag];
  }

  const argv = process.argv.slice(2);
  const fresh = argv.includes("--fresh");
  const skipHistory =
    argv.includes("--no-history") ||
    argv.includes("--no-story") ||
    process.env.DEMO_SKIP_HISTORY === "1" ||
    process.env.DEMO_SKIP_STORY === "1";
  const skipBuild =
    argv.includes("--skip-build") || process.env.DEMO_SKIP_BUILD === "1";

  if (process.env.NODE_ENV === "production" || process.env.AEGIS_ENV === "production") {
    die("refusing to run with NODE_ENV/AEGIS_ENV=production. This is a local-only command.");
  }

  const { password: pass, reused: passwordReused } = resolveLocalPersonaPassword();
  const platformSecret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!platformSecret) {
    die(
      "PLATFORM_BOOTSTRAP_SECRET is not set (shell or .env). The local Salanor ID uses it to authorise " +
        "provisioning; see .env.example for the local placeholder.",
    );
  }
  if (!process.env.AEGIS_BRIDGE_MASTER_KEY?.trim()) {
    console.warn(
      "WARNING: AEGIS_BRIDGE_MASTER_KEY is not set. The signing bridge cannot be enabled, so held cases\n" +
        "         will not be sealed. Set it (same value for the API and ID) and re-run.",
    );
  }

  const dbUrl =
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  if (!isLoopbackUrl(dbUrl.replace(/^postgres(ql)?:/i, "http:"))) {
    die(
      "DEMO_DATABASE_URL must point at a loopback Postgres (127.0.0.1 / localhost). demo:up never targets a hosted database.",
    );
  }
  // Force every child (migrate, API, ID, provision, wipe) onto the local DB, whatever .env says.
  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_URL_UNPOOLED = dbUrl;
  process.env.MIGRATION_DATABASE_URL = dbUrl; // local role owns the schema; used only by --fresh
  delete process.env.STOA_DATABASE_URL;

  const apiPort = Number(process.env.AEGIS_API_PORT || "8080");
  const idPort = Number(process.env.SALANOR_ID_PORT || "8091");
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const idBase = `http://127.0.0.1:${idPort}`;
  const consoleOrigin = "http://localhost:3000";

  process.env.AEGIS_API_PORT = String(apiPort);
  process.env.SALANOR_ID_PORT = String(idPort);
  process.env.SALANOR_ID_URL = idBase;
  process.env.AEGIS_API_URL = apiBase;
  process.env.NEXT_PUBLIC_AEGIS_API_URL = apiBase;
  process.env.CONSOLE_ORIGIN = consoleOrigin;
  process.env.CONSOLE_PUBLIC_URL = consoleOrigin;
  process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64;
  process.env.AEGIS_RECEIPT_KEY_ID =
    process.env.AEGIS_RECEIPT_KEY_ID || "receipt_dev";
  // Evidence-record failure -> 503 on policy evaluate (same hardening as hosted).
  process.env.AEGIS_ENFORCE_REQUIRE_EVIDENCE = "1";
  // Witness cadence: batch roots every 10s so Verify shows fresh checkpoints.
  process.env.WITNESS_INTERVAL_MS = process.env.WITNESS_INTERVAL_MS || "10000";
  // Local only: keep sign-in and intake limits out of the way of a live walkthrough.
  process.env.LOGIN_RATE_LIMIT = "100000";
  process.env.LOGIN_RATE_WINDOW_MS = "900000";
  process.env.INGEST_RATE_LIMIT_PER_MIN = "100000";
  // Console profile: normal console by default; the trimmed pitch profile is opt-in.
  const uiProfile = process.env.DEMO_UI_PROFILE?.trim() === "bank_demo" ? "bank_demo" : "";
  if (uiProfile) {
    process.env.AEGIS_UI_PROFILE = uiProfile;
    process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE = uiProfile;
  } else {
    delete process.env.AEGIS_UI_PROFILE;
    delete process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE;
  }

  // Ingest key for the local Demo Bank: stable when the shell supplies one, else throwaway.
  let generatedKey = false;
  let ingestKey = shellDemoBankKey;
  if (ingestKey && (ingestKey.length < 32 || /\s/.test(ingestKey))) {
    die("DEMO_BANK_INGEST_KEY must be at least 32 characters with no whitespace.");
  }
  if (!ingestKey) {
    ingestKey = `aegis_${randomBytes(24).toString("hex")}`;
    generatedKey = true;
  }
  process.env.DEMO_BANK_INGEST_KEY = ingestKey;
  process.env.AEGIS_INGEST_KEY = ingestKey;

  // Tenant file: always refresh the gitignored local stack file so ingest_key matches this run.
  // A custom DEMO_TENANT_FILE is accepted only when it targets loopback; we still write the
  // standard local file for prove/rehearse scripts.
  if (process.env.DEMO_TENANT_FILE?.trim()) {
    const custom = resolve(root, process.env.DEMO_TENANT_FILE.trim());
    if (!existsSync(custom)) die(`DEMO_TENANT_FILE ${custom} does not exist.`);
    assertLoopbackTenantFile(custom);
  }
  const tenantPath = writeLocalTenantFile({
    apiBase,
    idBase,
    consoleOrigin,
    password: pass,
    ingestKey,
  });
  process.env.DEMO_TENANT_FILE = tenantPath;

  if (fresh && shellAllowWipe?.trim() !== "1") {
    die(
      `--fresh wipes Demo Bank and needs ${ALLOW_WIPE_ENV}=1 set in your shell (an .env file cannot supply it).\n` +
        `  PowerShell:  $env:${ALLOW_WIPE_ENV} = "1"`,
    );
  }

  console.log("== demo:up ==");
  console.log(`DATABASE_URL=${dbUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`API=${apiBase}  ID=${idBase}  console=${consoleOrigin}`);

  // 1. Postgres: named volume + healthcheck (compose file). Prefer compose so recreates keep the volume.
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
      // Containers without a Healthcheck report State.Status=running; accept that.
      if (out === "healthy" || out === "running") {
        healthy = true;
        break;
      }
    } catch {
      console.warn("Postgres health check failed (Docker may be down).");
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!healthy) {
    die(
      "Postgres aegis-pg-demo is not healthy. Fix Docker Desktop, then:\n" +
        "  docker compose -f deploy/docker/docker-compose.postgres-demo.yml up -d",
    );
  }

  // 2. Migrate.
  await run("pnpm", ["--filter", "aegis-api", "db:migrate"]);

  // 3. Console build first (NEXT_PUBLIC_* are inlined at build, so the env above must be final).
  // PRODUCTION build (`next start`), never `next dev`: no dev "N" badge / overlay on stage.
  if (skipBuild) {
    console.log("Skipping console build (--skip-build) — reusing .next");
  } else {
    console.log("Building web-console (production)…");
    freePort(3000);
    await run("pnpm", ["--filter", "@salanor/web-console", "build"]);
  }

  // 4. Normal local services. Always restart so they use the local DB, not a process still
  // bound to a hosted/.env database.
  await ensureService({
    name: "salanor-id",
    port: idPort,
    forceRestart: true,
    healthUrls: [`${idBase}/health`],
    start: () => {
      // id prefers PORT over SALANOR_ID_PORT; never let a shared PORT steal the API port.
      process.env.PORT = String(idPort);
      process.env.SALANOR_ID_PORT = String(idPort);
      return bg("pnpm", ["--filter", "id", "exec", "tsx", "src/index.ts"], "id");
    },
  });
  await ensureService({
    name: "aegis-api",
    port: apiPort,
    forceRestart: true,
    healthUrls: [`${apiBase}/health`],
    waitAttempts: 90,
    start: () => {
      process.env.PORT = String(apiPort);
      process.env.AEGIS_API_PORT = String(apiPort);
      return bg(
        "pnpm",
        ["--filter", "aegis-api", "exec", "tsx", "src/index.ts"],
        "api",
      );
    },
  });

  // 5. Demo Bank, through the SAME commands as production.
  let orgId = "";
  if (fresh) {
    // wipe -> provision -> seed (demo:fresh reads the tenant file, MIGRATION_DATABASE_URL and
    // DEMO_BANK_INGEST_KEY from this environment).
    const out = await capture("node", ["tools/demo/demo-fresh.mjs"]);
    orgId = out.match(/Organisation id:\s*([0-9a-f-]{36})/i)?.[1] ?? "";
    if (skipHistory) {
      console.warn("--no-history is ignored with --fresh (demo:fresh always seeds history).");
    }
  } else {
    const out = await capture("pnpm", ["pilot:provision-demo-tenant"]);
    orgId = out.match(/Organisation id:\s*([0-9a-f-]{36})/i)?.[1] ?? "";
    if (skipHistory) {
      console.log("Skipping pilot:seed-history (--no-history)");
    } else {
      await run("pnpm", ["pilot:seed-history"]);
    }
  }
  if (orgId) {
    // Persist org id into the local tenant file for bank-simulator / prove scripts.
    try {
      const raw = JSON.parse(readFileSync(tenantPath, "utf8"));
      raw.organization_id = orgId;
      writeFileSync(tenantPath, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
      process.env.AEGIS_ORGANIZATION_ID = orgId;
    } catch {
      /* ignore */
    }
  }

  // 6. Witness worker on a short cadence (restart so it uses the local DB/env).
  killByCommandLine("witness:worker|witness.worker-cli");
  console.log(
    `Starting witness worker (every ${process.env.WITNESS_INTERVAL_MS}ms)…`,
  );
  bg("pnpm", ["--filter", "aegis-api", "witness:worker"], "witness-worker");

  // 7. Console.
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
        consoleBase: consoleOrigin,
        idBase,
        adminEmail: LOCAL_PERSONAS.admin.email,
        password: pass,
      }),
    )
    .catch((err) =>
      console.warn(
        "web-console not ready yet (API is up):",
        err instanceof Error ? err.message : err,
      ),
    );

  const personaLines = Object.values(LOCAL_PERSONAS)
    .map((p) => `  ${p.email}`)
    .join("\n");
  console.log(`
========================================
Local Demo Bank is up (normal API, real timers, no demo mode)
  API:     ${apiBase}
  ID:      ${idBase}
  Console: ${consoleOrigin}/aegis
  Org:     Demo Bank  (${orgId || "see provision output above"})
  Witness: batching every ${Number(process.env.WITNESS_INTERVAL_MS) / 1000}s
  Held loan cases escalate after 2 REAL minutes (tenant configuration).

Sign in with the personas below. Password is in ${TENANT_FILE}
  (${passwordReused ? "reused from the existing tenant file" : "generated for this local stack"}; gitignored, loopback only)
${personaLines}

Drive cases with the standalone bank simulator (pnpm bank-simulator).
  Set AEGIS_API_BASE, AEGIS_ORGANIZATION_ID, AEGIS_CONSOLE_ORIGIN, and AEGIS_INGEST_KEY
  (or DEMO_BANK_INGEST_KEY) in the simulator environment — never commit those values.
${generatedKey ? "  A one-time local ingest key was generated for this run (see provision output). Set DEMO_BANK_INGEST_KEY in your shell to keep a stable key.\n" : ""}
Next:
  pnpm demo:rehearse               headless walkthrough in a scratch org (demo-bank-rehearsal)
  pnpm demo:fresh                  wipe + re-provision + re-seed Demo Bank (needs ${ALLOW_WIPE_ENV}=1)
  pnpm pilot:wipe-tenant --slug demo-bank   dry run; add --confirm demo-bank with ${ALLOW_WIPE_ENV}=1 to wipe
  pnpm pilot:seed-history          re-seed the history (idempotent)
  pnpm demo:prove-escalation-2min  real 2-minute escalation proof
========================================
`);
  releaseBgChildren();
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
