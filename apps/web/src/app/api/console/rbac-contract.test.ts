import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireConsoleContextApi } = vi.hoisted(() => ({
  requireConsoleContextApi: vi.fn(),
}));

const { withConsoleOrg } = vi.hoisted(() => ({
  withConsoleOrg: vi.fn(),
}));

const {
  apiKeyFindMany,
  consoleAuditLogFindMany,
  consoleAuditLogCount,
  consoleAuditLogCreate,
  organizationMembershipFindUnique,
  organizationMembershipCount,
  organizationMembershipDelete,
  organizationMembershipUpdate,
  organizationInviteFindMany,
  organizationInviteFindFirst,
  organizationInviteUpdate,
  aegisPolicyFindFirst,
  aegisPolicyFindMany,
  aegisPolicyUpdateMany,
  aegisPolicyUpdate,
  prismaTransaction,
} = vi.hoisted(() => ({
  apiKeyFindMany: vi.fn(),
  consoleAuditLogFindMany: vi.fn(),
  consoleAuditLogCount: vi.fn(),
  consoleAuditLogCreate: vi.fn(),
  organizationMembershipFindUnique: vi.fn(),
  organizationMembershipCount: vi.fn(),
  organizationMembershipDelete: vi.fn(),
  organizationMembershipUpdate: vi.fn(),
  organizationInviteFindMany: vi.fn(),
  organizationInviteFindFirst: vi.fn(),
  organizationInviteUpdate: vi.fn(),
  aegisPolicyFindFirst: vi.fn(),
  aegisPolicyFindMany: vi.fn(),
  aegisPolicyUpdateMany: vi.fn(),
  aegisPolicyUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
}));

vi.mock("@/lib/console/session", () => ({
  requireConsoleContextApi,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findMany: apiKeyFindMany },
    consoleAuditLog: {
      findMany: consoleAuditLogFindMany,
      count: consoleAuditLogCount,
      create: consoleAuditLogCreate,
    },
    organizationMembership: {
      findUnique: organizationMembershipFindUnique,
      count: organizationMembershipCount,
      delete: organizationMembershipDelete,
      update: organizationMembershipUpdate,
    },
    organizationInvite: {
      findMany: organizationInviteFindMany,
      findFirst: organizationInviteFindFirst,
      update: organizationInviteUpdate,
    },
    aegisPolicy: {
      findFirst: aegisPolicyFindFirst,
      findMany: aegisPolicyFindMany,
      updateMany: aegisPolicyUpdateMany,
      update: aegisPolicyUpdate,
    },
    $transaction: prismaTransaction,
  },
}));

vi.mock("@/lib/console/api-route", async () => {
  return {
    withConsoleOrg: withConsoleOrg.mockImplementation(
      async (_orgId: string, _minRole: string, handler: (ctx: unknown) => Promise<Response>) =>
      handler({
        activeOrgId: "org-1",
        identityLinkId: "identity-1",
        membership: {
          role: "admin",
        },
      }),
    ),
  };
});

describe("console route role gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireConsoleContextApi.mockResolvedValue({
      activeOrgId: "org-1",
      identityLinkId: "identity-1",
    });
    apiKeyFindMany.mockResolvedValue([]);
    consoleAuditLogFindMany.mockResolvedValue([]);
    consoleAuditLogCount.mockResolvedValue(0);
    consoleAuditLogCreate.mockResolvedValue({});
    organizationMembershipUpdate.mockResolvedValue({
      id: "membership-1",
      identityLinkId: "identity-2",
      role: "developer",
      organization: {
        id: "org-1",
        name: "Org 1",
        slug: "org-1",
      },
    });
    organizationMembershipFindUnique.mockResolvedValue({
      id: "membership-1",
      identityLinkId: "identity-2",
      organizationId: "org-1",
      role: "developer",
      organization: {
        id: "org-1",
        name: "Org 1",
        slug: "org-1",
      },
    });
    organizationMembershipCount.mockResolvedValue(2);
    organizationMembershipDelete.mockResolvedValue({
      id: "membership-1",
      identityLinkId: "identity-2",
      organizationId: "org-1",
      role: "developer",
      organization: {
        id: "org-1",
        name: "Org 1",
        slug: "org-1",
      },
    });
    organizationInviteFindMany.mockResolvedValue([]);
    organizationInviteFindFirst.mockResolvedValue({
      id: "invite-1",
    });
    organizationInviteUpdate.mockResolvedValue({
      id: "invite-1",
    });
    aegisPolicyFindFirst.mockResolvedValue({
      id: "policy-1",
      name: "Default policy",
      version: 1,
      enabled: true,
      rules: {},
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    aegisPolicyFindMany.mockResolvedValue([]);
    aegisPolicyUpdate.mockResolvedValue({
      id: "policy-1",
    });
    aegisPolicyUpdateMany.mockResolvedValue({ count: 1 });
    prismaTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        aegisPolicy: {
          updateMany: aegisPolicyUpdateMany,
          update: aegisPolicyUpdate,
        },
      }),
    );
  });

  it("requires developer for api key routes", async () => {
    const route = await import("./api-keys/route");
    await route.GET();
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "developer",
      expect.any(Function),
    );
  });

  it("requires admin for billing management routes", async () => {
    const checkoutRoute = await import("./billing/checkout/route");
    await checkoutRoute.POST(
      new Request("http://localhost/api/console/billing/checkout", {
        method: "POST",
      }) as unknown as Parameters<(typeof checkoutRoute)["POST"]>[0],
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );

    const portalRoute = await import("./billing/portal/route");
    await portalRoute.POST(
      new Request("http://localhost/api/console/billing/portal", {
        method: "POST",
      }) as unknown as Parameters<(typeof portalRoute)["POST"]>[0],
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );
  });

  it("requires admin for policy management routes", async () => {
    const route = await import("./policy/route");
    await route.GET();
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );

    const enableRoute = await import("./policy/enable/route");
    await enableRoute.POST(
      new Request("http://localhost/api/console/policy/enable", {
        method: "POST",
        body: JSON.stringify({ policyId: "policy-1", enabled: true }),
      }) as unknown as Parameters<(typeof enableRoute)["POST"]>[0],
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );

    const manifestRoute = await import("./policy/manifest/route");
    await manifestRoute.GET();
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );
  });

  it("requires viewer for policy manifest verification route", async () => {
    const route = await import("./policy/verify-manifest/route");
    await route.POST(
      new Request("http://localhost/api/console/policy/verify-manifest", {
        method: "POST",
        body: JSON.stringify({ manifest: {} }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "viewer",
      expect.any(Function),
    );
  });

  it("requires compliance for audit route", async () => {
    const route = await import("./audit/route");
    await route.GET(
      new Request("http://localhost/api/console/audit") as unknown as Parameters<(typeof route)["GET"]>[0],
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "compliance",
      expect.any(Function),
    );
  });

  it("requires admin for membership role updates", async () => {
    const route = await import("./memberships/[id]/role/route");
    await route.PATCH(
      new Request("http://localhost/api/console/memberships/id/role", {
        method: "PATCH",
        body: JSON.stringify({ role: "developer" }),
      }) as unknown as Parameters<(typeof route)["PATCH"]>[0],
      { params: Promise.resolve({ id: "membership-1" }) },
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );
  });

  it("requires admin for membership deletion", async () => {
    const route = await import("./memberships/[id]/route");
    await route.DELETE(
      new Request("http://localhost/api/console/memberships/id", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "membership-1" }) },
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );
  });

  it("requires admin for invite routes", async () => {
    const listRoute = await import("./invites/route");
    await listRoute.GET();
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );

    const revokeRoute = await import("./invites/[id]/revoke/route");
    await revokeRoute.POST(
      new Request("http://localhost/api/console/invites/invite-1/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "invite-1" }) },
    );
    expect(withConsoleOrg).toHaveBeenCalledWith(
      "org-1",
      "admin",
      expect.any(Function),
    );
  });
});
