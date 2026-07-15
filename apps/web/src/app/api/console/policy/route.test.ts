import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireConsoleContextApi } = vi.hoisted(() => ({
  requireConsoleContextApi: vi.fn(),
}));

const currentRole = vi.hoisted(() => ({ value: "admin" as "admin" | "viewer" | "owner" }));

const { appendConsoleAudit } = vi.hoisted(() => ({
  appendConsoleAudit: vi.fn(),
}));

vi.mock("@/lib/console/session", () => ({
  requireConsoleContextApi,
}));

vi.mock("@/lib/console/audit", () => ({
  appendConsoleAudit,
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aegisPolicy: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        aegisPolicy: {
          updateMany: vi.fn(),
          create: vi.fn().mockResolvedValue({
            id: "policy-1",
            organizationId: "org-1",
            name: "Default policy",
            version: 1,
            enabled: true,
            rules: { version: "1", deny_if_missing_actor: true },
          }),
        },
      }),
    ),
  },
}));

describe("console policy route RBAC + validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole.value = "admin";
    requireConsoleContextApi.mockResolvedValue({
      activeOrgId: "org-1",
      identityLinkId: "identity-1",
    });
  });

  it("blocks viewer from policy update API", async () => {
    currentRole.value = "viewer";
    const route = await import("./route");
    const res = await route.PUT(
      new Request("http://localhost/api/console/policy", {
        method: "PUT",
        body: JSON.stringify({
          name: "Default policy",
          rules: { version: "1", deny_if_missing_actor: true },
          dryRun: true,
          runSmokeTest: false,
        }),
      }) as unknown as Parameters<(typeof route)["PUT"]>[0],
    );

    expect(res.status).toBe(403);
  });

  it("allows admin dry-run validation", async () => {
    const route = await import("./route");
    const res = await route.PUT(
      new Request("http://localhost/api/console/policy", {
        method: "PUT",
        body: JSON.stringify({
          name: "Default policy",
          rules: { version: "1", deny_if_missing_actor: true },
          dryRun: true,
          runSmokeTest: false,
        }),
      }) as unknown as Parameters<(typeof route)["PUT"]>[0],
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: true, details: [] });
  });

  it("allows template dry-run validation without smoke test flag", async () => {
    const route = await import("./route");
    const res = await route.PUT(
      new Request("http://localhost/api/console/policy", {
        method: "PUT",
        body: JSON.stringify({
          name: "Default policy",
          rules: {
            version: "1",
            deny_if_missing_actor: true,
            require_fields: ["actor.id", "actor.type", "context.inputs", "context.outcome"],
            max_payload_bytes: 32768,
          },
          dryRun: true,
        }),
      }) as unknown as Parameters<(typeof route)["PUT"]>[0],
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: true, details: [] });
  });

  it("rejects invalid rules schema", async () => {
    const route = await import("./route");
    const res = await route.PUT(
      new Request("http://localhost/api/console/policy", {
        method: "PUT",
        body: JSON.stringify({
          name: "Broken policy",
          rules: { version: "2" },
          dryRun: true,
          runSmokeTest: false,
        }),
      }) as unknown as Parameters<(typeof route)["PUT"]>[0],
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: "Policy rules are invalid",
      valid: false,
    });
  });

  it("saves policy with default smoke test", async () => {
    const route = await import("./route");
    const res = await route.PUT(
      new Request("http://localhost/api/console/policy", {
        method: "PUT",
        body: JSON.stringify({
          name: "Default policy",
          rules: {
            version: "1",
            deny_if_missing_actor: true,
            require_fields: ["actor.id", "actor.type", "context.inputs", "context.outcome"],
            max_payload_bytes: 32768,
          },
        }),
      }) as unknown as Parameters<(typeof route)["PUT"]>[0],
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      policy: {
        id: "policy-1",
        version: 1,
        enabled: true,
      },
    });
    expect(appendConsoleAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "policy_created",
      }),
    );
  });
});
