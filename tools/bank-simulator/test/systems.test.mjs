/**
 * Stage 8: systems registry + simulated connectors + core ledger (memory).
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { SYSTEMS } from "../systems.mjs";
import { SimulatedConnectors } from "../connectors-sim.mjs";
import { CoreLedger } from "../core-ledger.mjs";
import { ATTACKS, HONEST_LIMIT, runAttack } from "../redteam-attacks.mjs";

describe("Stage 8 systems + connectors + ledger", () => {
  let dir;
  /** @type {SimulatedConnectors} */
  let connectors;
  /** @type {CoreLedger} */
  let core;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "bank-sys-"));
    connectors = new SimulatedConnectors(join(dir, "conn"), {
      apiBase: "http://127.0.0.1:8080",
      ingestKey: "aegis_test",
    });
    await connectors.init();
    core = new CoreLedger({ dataDir: join(dir, "ledger") });
    await core.init();
  });

  after(async () => {
    await core.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("defines LOS, core, pay, bureau", () => {
    const ids = SYSTEMS.map((s) => s.source_id);
    assert.deepEqual(ids.sort(), ["src_bureau", "src_core", "src_los", "src_pay"].sort());
  });

  it("connector health exposes key id, last seq, outbox", () => {
    const health = connectors.health();
    const los = health.find((h) => h.id === "los");
    assert.ok(los);
    assert.equal(los.key_id, "k_los_2026_01");
    assert.equal(los.last_seq, 0);
    assert.equal(los.outbox_size, 0);
    assert.equal(los.connected, true);
  });

  it("recordSend advances seq; crash keeps outbox", async () => {
    await connectors.recordSend("los", { queue: true });
    const crash = await connectors.simulateCrashRestart("los");
    assert.equal(crash.no_seq_reuse, true);
    assert.equal(crash.nothing_lost, true);
    assert.equal(crash.after.last_seq, 1);
    assert.equal(crash.after.outbox_size, 1);
  });

  it("core refuses ungated disburse; forced bypass posts txn", async () => {
    const refused = await core.disburse({
      case_id: "C-1",
      action: { amount: 10, currency: "RWF" },
      skip_aegis: true,
    });
    assert.equal(refused.status, 403);
    const forced = await core.disburse({
      case_id: "C-2",
      action: { amount: 10, currency: "RWF" },
      force_db_bypass: true,
    });
    assert.equal(forced.status, 200);
    assert.ok(forced.body.entry?.txn_id);
  });

  it("exports JSONL and CSV feeds", async () => {
    const jsonl = await core.exportFeed("jsonl");
    assert.equal(jsonl.format, "jsonl");
    assert.ok(jsonl.rows >= 1);
    const csv = await core.exportFeed("csv");
    assert.ok(csv.text.startsWith("txn_id,"));
  });

  it("catalog covers attacks 1–18 + honest limit", () => {
    assert.equal(ATTACKS.length, 18);
    assert.deepEqual(
      ATTACKS.map((a) => a.id),
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    assert.ok(HONEST_LIMIT.expected.includes("G1"));
  });

  it("runAttack #6 and #16 produce outcomes", async () => {
    const a6 = await runAttack(6, { core, connectors });
    assert.equal(a6.ok, true);
    assert.match(String(a6.result), /refuse/i);
    const a16 = await runAttack(16, { core, connectors });
    assert.equal(a16.evidence.no_seq_reuse, true);
  });
});
