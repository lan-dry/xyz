import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: vi.fn(),
}));

const { ensureIdentityLink } = vi.hoisted(() => ({
  ensureIdentityLink: vi.fn(),
}));

const { appendConsoleAudit } = vi.hoisted(() => ({
  appendConsoleAudit: vi.fn(),
}));

const { setActiveOrgCookie } = vi.hoisted(() => ({
  setActiveOrgCookie: vi.fn(),
}));

const {
  prismaTransaction,
  orgCreate,
  membershipCreate,
} = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  orgCreate: vi.fn(),
  membershipCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/console/identity", () => ({ ensureIdentityLink }));
vi.mock("@/lib/console/audit", () => ({ appendConsoleAudit }));
vi.mock("@/lib/console/session", () => ({ setActiveOrgCookie }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransaction,
  },
}));

describe("POST /api/console/orgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "founder@example.com",
      },
    });
    ensureIdentityLink.mockResolvedValue({
      id: "identity-1",
    });
    orgCreate.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    membershipCreate.mockResolvedValue({
      id: "membership-1",
    });
    prismaTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        organization: { create: orgCreate },
        organizationMembership: { create: membershipCreate },
      }),
    );
  });

  it("creates org for signed-in user and sets owner membership", async () => {
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "Acme" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(201);
    expect(orgCreate).toHaveBeenCalledWith({
      data: { name: "Acme", slug: "acme", plan: "starter" },
      select: { id: true, name: true, slug: true },
    });
    expect(membershipCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        identityLinkId: "identity-1",
        role: "owner",
      },
    });
    expect(appendConsoleAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org_created",
        organizationId: "org-1",
      }),
    );
    expect(setActiveOrgCookie).toHaveBeenCalledWith("org-1");
  });

  it("returns 409 when slug already exists", async () => {
    prismaTransaction.mockRejectedValue({ code: "P2002" });

    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Organization slug already exists" });
  });

  it("returns 400 for invalid slug", async () => {
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "***" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Slug must be lowercase letters, numbers, and hyphens",
    });
  });

  it("slugifies name when slug is omitted", async () => {
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/console/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "My New Org" }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(201);
    expect(orgCreate).toHaveBeenCalledWith({
      data: { name: "My New Org", slug: "my-new-org", plan: "starter" },
      select: { id: true, name: true, slug: true },
    });
  });
});
