import { describe, expect, it } from "vitest";
import { handleIngest } from "./ingest-handler.js";
import { createMemoryIngestStore } from "./ingest-memory-store.js";
import type { ApsEvent } from "./types.js";

const SAMPLE_EVENT: ApsEvent = {
  schema_version: 1,
  event_id: "evt_222222222222422282222222222201",
  organization_id: "p2-test",
  trace_id: "trc_33333333333343338333333333301",
  agent_id: "agent:test",
  key_id: "key:test",
  emitted_at: "2026-05-16T12:00:00.000Z",
  actor_type: "agent",
  actor_principal: "agent:test",
  action_kind: "decision",
  policy_decision: "allow",
  payload: {
    subject: { type: "workflow_step", id: "step-1" },
    inputs: { amount: 100 },
    outcome: { decision: "approve" },
  },
};

function authHeaders(key = "dev-secret") {
  return new Headers({
    authorization: `Bearer ${key}`,
    "x-trace-id": "33333333-3333-4333-8333-333333333301",
  });
}

describe("handleIngest", () => {
  it("rejects missing API key", async () => {
    const store = createMemoryIngestStore();
    const result = await handleIngest({
      headers: new Headers(),
      body: SAMPLE_EVENT,
      expectedApiKey: "dev-secret",
      store,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("persists and survives simulated restart read", async () => {
    const store = createMemoryIngestStore();
    const headers = authHeaders();

    const written = await handleIngest({
      headers,
      body: SAMPLE_EVENT,
      expectedApiKey: "dev-secret",
      store,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const snapshot = new Map(store.rows);
    const restarted = createMemoryIngestStore();
    for (const [k, v] of snapshot) {
      restarted.rows.set(k, v);
    }

    expect(restarted.rows.get(written.event_id)?.payload.event_id).toBe(written.event_id);
  });

  it("publishes via bus publisher without store.create", async () => {
    const store = createMemoryIngestStore();
    let published = 0;
    const result = await handleIngest({
      headers: authHeaders(),
      body: SAMPLE_EVENT,
      expectedApiKey: "dev-secret",
      store,
      publisher: {
        async publish(input) {
          published += 1;
          return {
            rowId: input.payload.event_id,
            eventId: input.payload.event_id,
            traceId: input.traceId,
            created: true,
          };
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(published).toBe(1);
    expect(store.rows.size).toBe(0);
  });

  it("returns same event on idempotent replay", async () => {
    const store = createMemoryIngestStore();
    const headers = authHeaders();
    headers.set("idempotency-key", "idem-1");

    const first = await handleIngest({
      headers,
      body: SAMPLE_EVENT,
      expectedApiKey: "dev-secret",
      store,
    });
    const second = await handleIngest({
      headers,
      body: SAMPLE_EVENT,
      expectedApiKey: "dev-secret",
      store,
    });

    expect(first.ok && second.ok).toBe(true);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.event_id).toBe(first.event_id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });
});
