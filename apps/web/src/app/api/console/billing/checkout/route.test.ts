import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireConsoleContextApi } = vi.hoisted(() => ({
  requireConsoleContextApi: vi.fn(),
}));

const currentRole = vi.hoisted(() => ({ value: "owner" as "owner" | "viewer" }));

vi.mock("@/lib/console/session", () => ({
  requireConsoleContextApi,
}));

vi.mock("@/lib/console/api-route", () => ({
  withConsoleOrg: vi.fn(async (_orgId: string, minRole: string, handler: (ctx: unknown) => Promise<Response>) => {
    const rank: Record<string, number> = { viewer: 1, admin: 4, owner: 5 };
    if (rank[currentRole.value] < rank[minRole]) {
      return new Response(JSON.stringify({ error: "Requires admin role or higher" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return handler({
      activeOrgId: "org-1",
      identityLinkId: "identity-1",
      membership: { role: currentRole.value },
    });
  }),
}));

describe("POST /api/console/billing/checkout RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole.value = "owner";
    requireConsoleContextApi.mockResolvedValue({
      activeOrgId: "org-1",
      identityLinkId: "identity-1",
      membership: { role: currentRole.value },
    });
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("allows owner/admin path through RBAC gate", async () => {
    currentRole.value = "owner";
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/billing/checkout", {
        method: "POST",
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "Stripe is not configured" });
  });

  it("blocks viewer from billing management route", async () => {
    currentRole.value = "viewer";
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/billing/checkout", {
        method: "POST",
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(403);
  });
});
