/**
 * Key-leak test for the standalone bank simulator.
 *
 * Boots the real server.mjs on a free loopback port against a local mock Aegis API, saves an
 * ingest key through Setup, then GETs the page and every API and asserts the raw key string is
 * absent from every response (bodies and headers). Also runs stories (including one where the
 * mock API echoes the Authorization header back) and the wrong-key story (must be HTTP 401 and
 * create no case). No network, no real secrets: the key is generated per run.
 *
 * Run: node --test tools/bank-simulator/test/key-leak.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
const GOOD_KEY = `aegis_${randomBytes(24).toString("hex")}`;
const PASS = `pass-${randomBytes(9).toString("hex")}`; // >= 12 chars

// ---------------------------------------------------------------- mock Aegis API

const cases = new Set();
const seenAuth = [];

function startMockApi() {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const auth = String(req.headers.authorization ?? "");
      seenAuth.push(auth);
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (auth !== `Bearer ${GOOD_KEY}`) {
        return send(401, { error: "unauthorized", message: "Invalid ingest key" });
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      // Stage 1b: Connector posts signed envelopes to source-events (also accepted on governed/events).
      const event =
        body && body.aegis_envelope === "1" && body.event && typeof body.event === "object"
          ? body.event
          : body;
      if (
        req.url === "/v1/aegis/source-events" ||
        req.url === "/v1/aegis/governed/events"
      ) {
        cases.add(event.case_id);
        // Adversarial: echo the credential back, as a misbehaving upstream might.
        return send(200, {
          outcome: "allow",
          event_id: `evt_${event.case_id}`,
          plain_summary: "Allowed by the mock.",
          matched_rules: [],
          source_signed: body?.aegis_envelope === "1",
          evidence_grade: body?.aegis_envelope === "1" ? "G1" : "G0",
          debug_echo: auth,
        });
      }
      return send(404, { error: "not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------- simulator process

async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

async function startSimulator(extraEnv) {
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), "bank-sim-test-"));
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith("AEGIS_") || k.startsWith("BANK_SIMULATOR_")) delete env[k];
  }
  Object.assign(env, {
    PORT: String(port),
    HOST: "127.0.0.1",
    BANK_SIMULATOR_DATA_DIR: dataDir,
    // Isolate from provisioned .data/connectors keys/state during unit tests.
    AEGIS_CONNECTORS_DIR: join(dataDir, "connectors-root"),
    AEGIS_CONSOLE_ORIGIN: "http://console.test",
    ...extraEnv,
  });
  const child = spawn(process.execPath, [serverPath], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`simulator exited early:\n${logs}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    dataDir,
    logs: () => logs,
    async stop() {
      child.kill();
      await new Promise((r) => (child.exitCode !== null ? r() : child.once("exit", r)));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** GET/POST helper that keeps the session cookie and records everything the server sent back. */
function client(base) {
  let cookie = "";
  const transcript = []; // { where, text } for every response (headers + body)
  async function call(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json", "X-Simulator": "1" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    const headerText = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    transcript.push({ where: `${method} ${path}`, text: `${headerText}\n${text}` });
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* html */
    }
    return { status: res.status, text, json };
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b = {}) => call("POST", p, b),
    transcript,
  };
}

function assertKeyAbsent(transcript, key) {
  assert.ok(transcript.length > 0, "no responses were captured");
  for (const { where, text } of transcript) {
    assert.ok(!text.includes(key), `raw key leaked in ${where}`);
    assert.ok(!text.includes(encodeURIComponent(key)), `url-encoded key leaked in ${where}`);
    assert.ok(!text.includes(Buffer.from(key).toString("base64")), `base64 key leaked in ${where}`);
  }
}

const READ_PATHS = ["/", "/health", "/api/config", "/api/state", "/api/stories", "/nope"];

// ---------------------------------------------------------------- tests

describe("bank simulator: key never reaches the browser", () => {
  let mock;
  let sim;

  before(async () => {
    mock = await startMockApi();
    sim = await startSimulator({ BANK_SIMULATOR_PASS: PASS });
  });
  after(async () => {
    await sim?.stop();
    await new Promise((r) => mock.server.close(r));
  });

  it("boots without an ingest key and refuses stories until configured", async () => {
    const c = client(sim.base);
    assert.equal((await c.get("/api/config")).status, 401, "setup API must need the passphrase");
    assert.equal((await c.post("/api/login", { passphrase: PASS })).status, 200);

    const cfg = (await c.get("/api/config")).json;
    assert.equal(cfg.configured, false);
    assert.equal(cfg.keyPresent, false);
    assert.match(cfg.status_line, /^Not connected/);

    const run = await c.post("/api/story", { story_id: "loan_within_limit" });
    assert.equal(run.status, 409);
    assert.equal(cases.size, 0);
  });

  it("saves a key via Setup and never returns it", async () => {
    const c = client(sim.base);
    await c.post("/api/login", { passphrase: PASS });

    const bad = await c.post("/api/config", { apiBase: "not a url", ingestKey: GOOD_KEY, orgId: "o", agentId: "a" });
    assert.equal(bad.status, 400);

    const saved = await c.post("/api/config", {
      apiBase: `http://127.0.0.1:${mock.port}`,
      ingestKey: GOOD_KEY,
      orgId: "org_demo_bank",
      agentId: "agent_credit",
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(
      { configured: saved.json.configured, keyPresent: saved.json.keyPresent, orgId: saved.json.orgId, agentId: saved.json.agentId },
      { configured: true, keyPresent: true, orgId: "org_demo_bank", agentId: "agent_credit" },
    );
    assert.equal(saved.json.status_line, "Connected to org_demo_bank \u00b7 agent_credit");
    assert.equal("ingestKey" in saved.json, false);

    // Stored server-side, never client-side.
    const file = join(sim.dataDir, "config.json");
    assert.ok((await readFile(file, "utf8")).includes(GOOD_KEY), "server keeps the plaintext to call the API");
    if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);

    // Changing the API base without re-entering the key is refused.
    const repoint = await c.post("/api/config", {
      apiBase: "http://127.0.0.1:1",
      ingestKey: "",
      orgId: "org_demo_bank",
      agentId: "agent_credit",
    });
    assert.equal(repoint.status, 400);

    assertKeyAbsent(c.transcript, GOOD_KEY);
  });

  it("shows what was sent with the key masked, and never leaks it on any page or API", async () => {
    const c = client(sim.base);
    await c.post("/api/login", { passphrase: PASS });

    const run = await c.post("/api/story", { story_id: "loan_within_limit" });
    assert.equal(run.status, 200);
    assert.equal(run.json.outcome, "allow");
    const [call] = run.json.requests;
    assert.equal(call.method, "POST");
    assert.equal(call.endpoint, `http://127.0.0.1:${mock.port}/v1/aegis/source-events`);
    assert.equal(call.via, "aegis-connector");
    assert.equal(call.payload.actor.id, "agent_credit");
    assert.equal(call.response.status, 200);
    assert.equal(call.headers.Authorization, "Bearer aegis_\u2026****");
    // The mock echoed the credential in its response body; the simulator must have masked it.
    assert.equal(call.response.body.debug_echo, "Bearer aegis_\u2026****");

    for (const p of READ_PATHS) await c.get(p);
    const state = (await c.get("/api/state")).json;
    assert.equal(state.configured, true);
    assert.equal(state.status_line, "Connected to org_demo_bank \u00b7 agent_credit");
    assert.equal((await c.get("/api/config")).json.keyPresent, true);

    // A fresh, logged-out client sees only the login gate; still no key.
    const anon = client(sim.base);
    for (const p of READ_PATHS) await anon.get(p);
    await anon.post("/api/login", { passphrase: "wrong-passphrase-value" });

    assertKeyAbsent([...c.transcript, ...anon.transcript], GOOD_KEY);
    assert.ok(seenAuth.includes(`Bearer ${GOOD_KEY}`), "the server did use the key upstream");
  });

  it("wrong-key story returns HTTP 401 and creates no case", async () => {
    const c = client(sim.base);
    await c.post("/api/login", { passphrase: PASS });
    const before = cases.size;

    const run = await c.post("/api/story", { story_id: "wrong_key" });
    assert.equal(run.status, 200);
    assert.equal(run.json.http_status, 401);
    assert.equal(run.json.ok, true);
    assert.equal(run.json.case_id, null);
    assert.equal(run.json.case_created, false);
    assert.equal(run.json.console_url, null);
    assert.equal(run.json.requests.length, 1);
    const [call] = run.json.requests;
    assert.equal(call.response.status, 401);
    assert.equal(call.headers.Authorization, "Bearer aegis_\u2026****");
    assert.equal(cases.size, before, "no case may be created");

    const stories = (await c.get("/api/stories")).json.stories;
    assert.ok(stories.some((s) => s.id === "wrong_key"));
    assertKeyAbsent(c.transcript, GOOD_KEY);
  });

  it("reset removes the saved key from disk", async () => {
    const c = client(sim.base);
    await c.post("/api/login", { passphrase: PASS });
    const out = await c.post("/api/config/reset");
    assert.equal(out.json.configured, false);
    await assert.rejects(readFile(join(sim.dataDir, "config.json"), "utf8"));
    assertKeyAbsent(c.transcript, GOOD_KEY);
  });
});

describe("bank simulator: environment-supplied key", () => {
  let mock;
  let sim;

  before(async () => {
    mock = await startMockApi();
    sim = await startSimulator({
      AEGIS_API_BASE: `http://127.0.0.1:${mock.port}`,
      AEGIS_INGEST_KEY: GOOD_KEY,
      AEGIS_ORGANIZATION_ID: "org_env",
      AEGIS_AGENT_ID: "agent_env",
    });
  });
  after(async () => {
    await sim?.stop();
    await new Promise((r) => mock.server.close(r));
  });

  it("starts pre-configured (Demo Bank), never writes the key to disk, never returns it", async () => {
    const c = client(sim.base);
    const cfg = (await c.get("/api/config")).json;
    assert.equal(cfg.configured, true);
    assert.equal(cfg.source, "env");
    assert.equal(cfg.status_line, "Connected to org_env \u00b7 agent_env");

    const run = await c.post("/api/story", { story_id: "loan_within_limit" });
    assert.equal(run.status, 200);
    for (const p of READ_PATHS) await c.get(p);

    await assert.rejects(readFile(join(sim.dataDir, "config.json"), "utf8"), "env-only key is not persisted");
    assertKeyAbsent(c.transcript, GOOD_KEY);
  });
});
