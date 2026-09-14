import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: { findUnique },
    aegisIngestEvent: { findMany: vi.fn() },
  },
}));

import { assertOrgMembershipForUser, orgEventsQueryArgs } from "./events";

describe("tenant isolation", () => {
  it("event queries always filter by organizationId", () => {
    const orgA = "11111111-1111-4111-8111-111111111111";
    const orgB = "22222222-2222-4222-8222-222222222222";

    expect(orgEventsQueryArgs(orgA, 10).where).toEqual({ organizationId: orgA });
    expect(orgEventsQueryArgs(orgB, 5).where).toEqual({ organizationId: orgB });
    expect(orgEventsQueryArgs(orgA, 10).where.organizationId).not.toBe(orgB);
  });

  it("user A cannot read org B without membership", async () => {
    const identityA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const orgB = "22222222-2222-4222-8222-222222222222";

    findUnique.mockResolvedValue(null);

    const allowed = await assertOrgMembershipForUser(identityA, orgB);
    expect(allowed).toBe(false);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_identityLinkId: {
          organizationId: orgB,
          identityLinkId: identityA,
        },
      },
      select: { id: true },
    });
  });
});
