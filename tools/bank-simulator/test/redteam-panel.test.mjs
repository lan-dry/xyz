/**
 * Stage 8: Red Team panel API on a live bank-simulator process (mock Aegis).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
const GOOD_KEY = `aegis_${randomBytes(24).toString("hex")}`;

function startMockApi() {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function waitHealth(base, ms = 20_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(`${base}/health`);
        if (r.ok) return resolve(true);
      } catch {
        /* retry */
      }
      if (Date.now() - start > ms) reject(new Error("simulator health timeout"));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

describe("Red Team panel HTTP", () => {
  let mock;
  let child;
  let base;
  let dataDir;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "bank-rt-"));
    mock = await startMockApi();
    const port = 4100 + Math.floor(Math.random() * 500);
    child = spawn(
      process.execPath,
      [serverPath],
      {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          AEGIS_API_BASE: `http://127.0.0.1:${mock.port}`,
          AEGIS_INGEST_KEY: GOOD_KEY,
          AEGIS_ORGANIZATION_ID: "org_test",
          BANK_SIMULATOR_DATA_DIR: dataDir,
          ALLOW_ANY_HOST: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    base = `http://127.0.0.1:${port}`;
    await waitHealth(base);
  });

  after(async () => {
    if (child?.pid) {
      child.kill("SIGTERM");
    }
    mock?.server.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("GET /api/systems returns four systems", async () => {
    const r = await fetch(`${base}/api/systems`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.systems.length >= 4);
    const ids = body.systems.map((s) => s.source_id);
    assert.ok(ids.includes("src_los"));
    assert.ok(ids.includes("src_core"));
    assert.ok(ids.includes("src_pay"));
    assert.ok(ids.includes("src_bureau"));
  });

  it("GET /api/redteam lists 18 attacks", async () => {
    const r = await fetch(`${base}/api/redteam`);
    const body = await r.json();
    assert.equal(body.attacks.length, 18);
    assert.ok(body.honest_limit);
  });

  it("POST /api/redteam/run #6 refuses ungated pay", async () => {
    const r = await fetch(`${base}/api/redteam/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Simulator": "1" },
      body: JSON.stringify({ attack_id: 6 }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.evidence.refused.code, "confirm_required");
  });

  it("POST /api/honest-limit returns G1 label", async () => {
    const r = await fetch(`${base}/api/honest-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Simulator": "1" },
      body: "{}",
    });
    const body = await r.json();
    assert.equal(body.evidence.grade, "G1");
    assert.match(body.evidence.label, /not corroborated/);
  });
});
