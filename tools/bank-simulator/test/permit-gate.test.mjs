/**
 * In-path gate: core ledger refuses ungated pay; pays only when Aegis permit says yes.
 * Run: node --test tools/bank-simulator/test/permit-gate.test.mjs
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
const CASE_OK = "LN-RW-TEST-PERMIT-OK";
const CASE_HELD = "LN-RW-TEST-PERMIT-HELD";

function startMockApi() {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const auth = String(req.headers.authorization ?? "");
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (auth !== `Bearer ${GOOD_KEY}`) {
        return send(401, { error: "unauthorized" });
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (req.url === "/v1/aegis/execution/permit") {
        if (body.case_id === CASE_OK && body.action?.amount === 100) {
          return send(200, {
            permitted: true,
            reason: "Permitted under sealed approved",
            code: "permitted",
            receipt_id: "rcpt_test",
            receipt_hash: "sha256:test",
            outcome: "approved",
            case_id: CASE_OK,
          });
        }
        if (body.case_id === CASE_OK && body.action?.amount === 999) {
          return send(403, {
            permitted: false,
            reason: "digest mismatch",
            code: "digest_mismatch",
            case_id: CASE_OK,
          });
        }
        return send(403, {
          permitted: false,
          reason: "Case is still held",
          code: "held",
          case_id: body.case_id,
        });
      }
      return send(404, { error: "not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

async function startSimulator(apiPort) {
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), "bank-sim-permit-"));
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith("AEGIS_") || k.startsWith("BANK_SIMULATOR_")) delete env[k];
  }
  Object.assign(env, {
    PORT: String(port),
    HOST: "127.0.0.1",
    AEGIS_API_BASE: `http://127.0.0.1:${apiPort}`,
    AEGIS_INGEST_KEY: GOOD_KEY,
    AEGIS_ORGANIZATION_ID: "org_test",
    BANK_SIMULATOR_DATA_DIR: dataDir,
  });
  const child = spawn(process.execPath, [serverPath], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("simulator boot timeout")), 8000);
    child.stdout.on("data", (buf) => {
      if (String(buf).includes("Simulated core banking")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`simulator exited ${code}`));
    });
  });
  return { child, port, dataDir };
}

async function post(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Simulator": "1" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("core ledger permit gate", () => {
  let mock;
  let sim;

  before(async () => {
    mock = await startMockApi();
    sim = await startSimulator(mock.port);
  });

  after(async () => {
    sim?.child.kill("SIGTERM");
    mock?.server.close();
    if (sim?.dataDir) await rm(sim.dataDir, { recursive: true, force: true });
  });

  it("refuses ungated disbursement", async () => {
    const r = await post(sim.port, "/api/disburse/skip-aegis", {
      case_id: CASE_OK,
      action: { amount: 100, currency: "RWF" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.data.permitted, false);
    assert.equal(r.data.code, "permit_required");
  });

  it("refuses while Aegis says held", async () => {
    const r = await post(sim.port, "/api/disburse", {
      case_id: CASE_HELD,
      action: { amount: 100, currency: "RWF" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.data.permitted, false);
    assert.equal(r.data.code, "held");
  });

  it("pays when Aegis permit matches", async () => {
    const r = await post(sim.port, "/api/disburse", {
      case_id: CASE_OK,
      action: { amount: 100, currency: "RWF" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.entry.receipt_id, "rcpt_test");
  });

  it("refuses digest mismatch", async () => {
    const r = await post(sim.port, "/api/disburse", {
      case_id: CASE_OK,
      action: { amount: 999, currency: "RWF" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, "digest_mismatch");
  });
});
