import { describe, expect, it } from "vitest";

import { encodeIngestEnvelope, parseIngestEnvelope } from "./envelope";

const sampleEvent = {
  aps_version: "0.1" as const,
  event_id: "11111111-1111-4111-8111-111111111111",
  recorded_at: "2026-05-16T12:00:00.000Z",
  tenant_id: "t1",
  actor: { id: "a1", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "s1" },
  context: { inputs: {}, outcome: {} },
  signature: { alg: "local-placeholder" as const, value: "placeholder:00" },
  chain: { prev_event_hash: null, event_hash: "sha256:abc" },
};

describe("ingest envelope", () => {
  it("round-trips", () => {
    const envelope = {
      schema_version: "1" as const,
      trace_id: "22222222-2222-4222-8222-222222222222",
      event: sampleEvent,
      published_at: "2026-05-16T12:00:01.000Z",
    };
    const raw = encodeIngestEnvelope(envelope);
    const parsed = parseIngestEnvelope(raw);
    expect(parsed.trace_id).toBe(envelope.trace_id);
    expect(parsed.event.event_id).toBe(sampleEvent.event_id);
  });
});
