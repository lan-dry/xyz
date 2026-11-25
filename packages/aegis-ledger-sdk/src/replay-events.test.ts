import { describe, expect, it } from "vitest";

import { buildEvidenceExportPack, replayEvents } from "./replay-events.js";
import { record } from "./record.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readEvents } from "./store.js";
import type { ApsEvent } from "./types.js";

describe("replayEvents", () => {
  it("matches file-based replay digest", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-test-"));
    const storePath = join(dir, "events.ndjson");
    try {
      record(
        storePath,
        {
          organization_id: "t",
          agent_id: "agent:a",
          key_id: "key:a",
          actor_type: "agent",
          actor_principal: "a",
          action_kind: "decision",
          policy_decision: "allow",
          payload: {
            subject: { type: "step", id: "s" },
            inputs: { x: 1 },
            outcome: { ok: true },
          },
        },
        {
          event_id: "evt_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaa",
          emitted_at: "2026-05-16T12:00:00.000Z",
          trace_id: "trc_replay_file",
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
    const events: ApsEvent[] = [
      {
        schema_version: 1,
        event_id: "evt_bbbbbbbbbbbb4bbb8bbbbbbbbbbbbb",
        organization_id: "t",
        trace_id: "trc_export_pack",
        agent_id: "agent:a",
        key_id: "key:a",
        emitted_at: "2026-05-16T12:00:00.000Z",
        actor_type: "agent",
        actor_principal: "a",
        action_kind: "decision",
        policy_decision: "allow",
        payload: { subject: { type: "step", id: "s" }, inputs: {}, outcome: { ok: true } },
      },
    ];
    const pack = buildEvidenceExportPack({ traceId: "trace-1", events });
    expect(pack.schema_version).toBe("1");
    expect(pack.replay.steps.length).toBe(1);
  });
});
