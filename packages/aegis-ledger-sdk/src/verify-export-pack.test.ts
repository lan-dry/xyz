import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeMerkleRoot } from "./merkle.js";
import { record } from "./record.js";
import { buildEvidenceExportPack } from "./replay-events.js";
import { verifyExportPack } from "./verify-export-pack.js";

function oneValidEvent() {
  const dir = mkdtempSync(join(tmpdir(), "aegis-verify-"));
  const storePath = join(dir, "events.ndjson");
  try {
    const { event } = record(
      storePath,
      {
        tenant_id: "t",
        actor: { id: "a", type: "software_agent" },
        action: "decision.record",
        subject: { type: "step", id: "s" },
        context: { inputs: {}, outcome: { ok: true } },
      },
      {
        event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        recorded_at: "2026-05-16T12:00:00.000Z",
      },
    );
    return event;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("verifyExportPack", () => {
  it("accepts a valid export pack with anchor", () => {
    const event = oneValidEvent();
    const merkleRoot = computeMerkleRoot([event.chain.event_hash]);
    const pack = buildEvidenceExportPack({
      traceId: "trace-verify",
      events: [event],
      anchor: {
        batch_id: "batch-1",
        merkle_root: merkleRoot,
        anchor_status: "stub",
        anchor_ref: "stub:abc",
        local_chain_root: "abc",
      },
    });
    const result = verifyExportPack(pack);
    expect(result.ok).toBe(true);
    expect(result.event_count).toBe(1);
  });

  it("rejects merkle root mismatch", () => {
    const event = oneValidEvent();
    const pack = buildEvidenceExportPack({
      traceId: "trace-bad",
      events: [event],
      anchor: {
        batch_id: "batch-1",
        merkle_root: "0".repeat(64),
        anchor_status: "stub",
        anchor_ref: null,
        local_chain_root: null,
      },
    });
    const result = verifyExportPack(pack);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("merkle_root"))).toBe(true);
  });

  it("rejects invalid schema version", () => {
    const event = oneValidEvent();
    const pack = buildEvidenceExportPack({ traceId: "t", events: [event] });
    (pack as { schema_version: string }).schema_version = "99";
    const result = verifyExportPack(pack);
    expect(result.ok).toBe(false);
  });

  it("validates Tier-C witness block on anchored export", () => {
    const event = oneValidEvent();
    const merkleRoot = computeMerkleRoot([event.chain.event_hash]);
    const pack = buildEvidenceExportPack({
      traceId: "trace-witness",
      events: [event],
      anchor: {
        batch_id: "batch-1",
        merkle_root: merkleRoot,
        anchor_status: "anchored",
        anchor_ref: "ots-anchored:ots/abc.ots",
        local_chain_root: "abc",
      },
    });
    const result = verifyExportPack(pack);
    expect(result.ok).toBe(true);
    expect(result.witness_valid).toBe(true);
    expect(pack.witness?.merkle_root).toBe(merkleRoot);
  });

  it("rejects witness merkle_root mismatch", () => {
    const event = oneValidEvent();
    const merkleRoot = computeMerkleRoot([event.chain.event_hash]);
    const pack = buildEvidenceExportPack({
      traceId: "trace-bad-witness",
      events: [event],
      anchor: {
        batch_id: "batch-1",
        merkle_root: merkleRoot,
        anchor_status: "stub",
        anchor_ref: null,
        local_chain_root: null,
      },
    });
    pack.witness = {
      merkle_root: "0".repeat(64),
      anchor_status: "stub",
      anchor_ref: null,
      event_count: 1,
      generated_at: new Date().toISOString(),
    };
    const result = verifyExportPack(pack);
    expect(result.ok).toBe(false);
    expect(result.witness_valid).toBe(false);
  });
});
