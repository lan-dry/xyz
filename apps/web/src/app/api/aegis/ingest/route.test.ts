import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeIngestRequest, extractIngestApiKey } = vi.hoisted(() => ({
  authorizeIngestRequest: vi.fn(),
  extractIngestApiKey: vi.fn(),
}));

const { handleIngest, parseIngestBody } = vi.hoisted(() => ({
  handleIngest: vi.fn(),
  parseIngestBody: vi.fn(),
}));

const { enforceIngestPolicy } = vi.hoisted(() => ({
  enforceIngestPolicy: vi.fn(),
}));

vi.mock("@/lib/aegis/ingest-auth", () => ({
  authorizeIngestRequest,
  extractIngestApiKey,
}));

vi.mock("@/lib/aegis/ingest-policy", () => ({
  enforceIngestPolicy,
}));

vi.mock("@salanor/aegis-ledger-sdk/ingest-handler", () => ({
  handleIngest,
  parseIngestBody,
}));

vi.mock("@/lib/aegis/nats-ingest-publisher", () => ({
  isBusIngestEnabled: vi.fn(() => false),
  createNatsIngestPublisher: vi.fn(() => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aegisIngestEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("POST /api/aegis/ingest policy enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeIngestRequest.mockResolvedValue({ ok: true, organizationId: "org-1", source: "api_key" });
    extractIngestApiKey.mockReturnValue("att_live_1");
    parseIngestBody.mockReturnValue({
      ok: true,
      event: {
        event_id: "evt-1",
      },
    });
  });

  it("rejects with 422 when active policy denies event", async () => {
    enforceIngestPolicy.mockResolvedValue({
      ok: false,
      status: 422,
      message: "Policy denied event.",
      details: ["require_fields: missing actor.id"],
      policy: { id: "pol-1", name: "default", version: 1 },
    });

    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/aegis/ingest", {
        method: "POST",
        body: JSON.stringify({ event_id: "evt-1" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "Policy denied event.",
      details: ["require_fields: missing actor.id"],
      policy: { id: "pol-1", name: "default", version: 1 },
    });
    expect(handleIngest).not.toHaveBeenCalled();
  });

  it("continues ingest when policy allows event", async () => {
    enforceIngestPolicy.mockResolvedValue({ ok: true });
    handleIngest.mockResolvedValue({
      ok: true,
      status: 201,
      event_id: "evt-1",
      trace_id: "trace-1",
      created: true,
    });

    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/aegis/ingest", {
        method: "POST",
        body: JSON.stringify({ event_id: "evt-1" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      event_id: "evt-1",
      trace_id: "trace-1",
      pipeline: "direct",
    });
    expect(handleIngest).toHaveBeenCalledTimes(1);
  });
});
