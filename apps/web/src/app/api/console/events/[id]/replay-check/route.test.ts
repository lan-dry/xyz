import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireConsoleContextApi } = vi.hoisted(() => ({
  requireConsoleContextApi: vi.fn(),
}));

const { withConsoleOrg } = vi.hoisted(() => ({
  withConsoleOrg: vi.fn(),
}));

const { evaluatePolicyForReplay } = vi.hoisted(() => ({
  evaluatePolicyForReplay: vi.fn(),
}));

const { aegisIngestEventFindFirst } = vi.hoisted(() => ({
  aegisIngestEventFindFirst: vi.fn(),
}));

vi.mock("@/lib/console/session", () => ({
  requireConsoleContextApi,
}));

vi.mock("@/lib/console/api-route", () => ({
  withConsoleOrg,
}));

vi.mock("@/lib/aegis/ingest-policy", () => ({
  evaluatePolicyForReplay,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aegisIngestEvent: {
      findFirst: aegisIngestEventFindFirst,
    },
  },
}));

describe("POST /api/console/events/[id]/replay-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireConsoleContextApi.mockResolvedValue({
      activeOrgId: "org-1",
      identityLinkId: "identity-1",
    });
    withConsoleOrg.mockImplementation(
      async (_orgId: string, _minRole: string, handler: (ctx: unknown) => Promise<Response>) =>
        handler({
          activeOrgId: "org-1",
          identityLinkId: "identity-1",
          membership: { role: "viewer" },
        }),
    );
    aegisIngestEventFindFirst.mockResolvedValue({
      id: "row-1",
      traceId: "trace-1",
      payload: {
        event_id: "evt-1",
        aps_version: "0.1",
      },
    });
    evaluatePolicyForReplay.mockResolvedValue({
      allow: true,
      violations: [],
      policy: { id: "policy-1", name: "default", version: 1 },
    });
  });

  it("returns replay policy evaluation for stored event", async () => {
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/events/row-1/replay-check", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "row-1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      eventRowId: "row-1",
      eventId: "evt-1",
      traceId: "trace-1",
      replayPolicy: {
        allow: true,
      },
    });
    expect(withConsoleOrg).toHaveBeenCalledWith("org-1", "viewer", expect.any(Function));
  });

  it("returns 404 when event is missing", async () => {
    aegisIngestEventFindFirst.mockResolvedValue(null);
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/events/missing/replay-check", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(res.status).toBe(404);
  });
});
