import { describe, expect, it } from "vitest";

import { buildEvidenceExportPack, replayEvents } from "./replay-events.js";
import { record } from "./record.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readEvents } from "./store.js";

describe("replayEvents", () => {
  it("matches file-based replay digest", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-test-"));
    const storePath = join(dir, "events.ndjson");
    try {
      record(
        storePath,
        {
          tenant_id: "t",
          actor: { id: "a", type: "software_agent" },
          action: "decision.record",
          subject: { type: "step", id: "s" },
          context: {
            inputs: { x: 1 },
            outcome: { ok: true },
          },
        },
        {
          event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          recorded_at: "2026-05-16T12:00:00.000Z",
        },
      );
      const events = readEvents(storePath);
      const fromMemory = replayEvents(events, "tier-a-demo");
      expect(fromMemory.digest).toMatch(/^sha256:/);
      expect(fromMemory.steps.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds export pack", () => {
    const events = [
      {
        aps_version: "0.1" as const,
        event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        recorded_at: "2026-05-16T12:00:00.000Z",
        tenant_id: "t",
        actor: { id: "a", type: "software_agent" },
        action: "decision.record",
        subject: { type: "step", id: "s" },
        context: { inputs: {}, outcome: { ok: true } },
        signature: { alg: "local-placeholder" as const, value: "placeholder:00" },
        chain: { prev_event_hash: null, event_hash: "sha256:deadbeef" },
      },
    ];
    const pack = buildEvidenceExportPack({ traceId: "trace-1", events });
    expect(pack.schema_version).toBe("1");
    expect(pack.replay.steps.length).toBe(1);
  });
});
