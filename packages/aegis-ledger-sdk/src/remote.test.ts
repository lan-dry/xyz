import { describe, expect, it, vi } from "vitest";
import { AegisRemoteError, remoteRecord } from "./remote.js";

describe("remoteRecord", () => {
  it("posts to ingest and returns ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          event_id: "44444444-4444-4444-8444-444444444401",
          trace_id: "55555555-5555-4555-8555-555555555501",
        }),
    });

    const result = await remoteRecord(
      {
        tenant_id: "remote-demo",
        actor: { id: "agent:demo", type: "software_agent" },
        action: "decision.record",
        subject: { type: "workflow_step", id: "step-1" },
        context: {
          inputs: { amount: 50 },
          outcome: { decision: "approve" },
        },
      },
      {
        baseUrl: "http://localhost:3000",
        apiKey: "dev-secret",
        traceId: "55555555-5555-4555-8555-555555555501",
        event_id: "44444444-4444-4444-8444-444444444401",
        recorded_at: "2026-05-16T12:00:00.000Z",
        fetchImpl: fetchMock as typeof fetch,
      },
    );

    expect(result.event_id).toBe("44444444-4444-4444-8444-444444444401");
    expect(result.trace_id).toBe("55555555-5555-4555-8555-555555555501");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/aegis/ingest");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev-secret");
    expect(headers["x-trace-id"]).toBe("55555555-5555-4555-8555-555555555501");
  });

  it("throws AegisRemoteError on 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Unauthorized." }),
    });

    await expect(
      remoteRecord(
        {
          actor: { id: "a", type: "software_agent" },
          action: "decision.record",
          subject: { type: "workflow_step", id: "s" },
          context: { inputs: {}, outcome: { decision: "x" } },
        },
        {
          baseUrl: "http://localhost:3000",
          apiKey: "bad",
          fetchImpl: fetchMock as typeof fetch,
        },
      ),
    ).rejects.toBeInstanceOf(AegisRemoteError);
  });
});
