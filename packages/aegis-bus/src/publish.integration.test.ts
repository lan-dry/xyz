import { connect } from "nats";
import { describe, expect, it } from "vitest";

import { DEFAULT_NATS_URL, loadBusConfig } from "./config";
import { closeAegisBus, publishIngest } from "./publish";

const natsAvailable = process.env.AEGIS_NATS_INTEGRATION === "1";

describe.skipIf(!natsAvailable)("NATS JetStream integration", () => {
  it("publishes to local NATS", async () => {
    const config = loadBusConfig({ NATS_URL: process.env.NATS_URL ?? DEFAULT_NATS_URL });
    try {
      const nc = await connect({ servers: config.natsUrl, timeout: 2000 });
      await nc.close();
    } catch {
      return;
    }

    const result = await publishIngest({
      traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      event: {
        aps_version: "0.1",
        event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        recorded_at: "2026-05-16T12:00:00.000Z",
        tenant_id: "integration",
        actor: { id: "agent:int", type: "software_agent" },
        action: "decision.record",
        subject: { type: "step", id: "s" },
        context: { inputs: {}, outcome: {} },
        signature: { alg: "local-placeholder", value: "placeholder:00" },
        chain: { prev_event_hash: null, event_hash: "sha256:abc" },
      },
    });

    expect(result.streamSeq).toBeGreaterThan(0);
    await closeAegisBus();
  });
});
