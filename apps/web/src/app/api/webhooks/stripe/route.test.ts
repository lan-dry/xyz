import { beforeEach, describe, expect, it, vi } from "vitest";

const { organizationFindUnique, organizationFindFirst, organizationUpdate } = vi.hoisted(() => ({
  organizationFindUnique: vi.fn(),
  organizationFindFirst: vi.fn(),
  organizationUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: organizationFindUnique,
      findFirst: organizationFindFirst,
      update: organizationUpdate,
    },
  },
}));

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    organizationFindUnique.mockResolvedValue({ id: "org-1" });
    organizationFindFirst.mockResolvedValue({ id: "org-1" });
    organizationUpdate.mockResolvedValue({ id: "org-1" });
  });

  it("accepts webhook JSON without signature in test env", async () => {
    const route = await import("./route");
    const res = await route.POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({
          id: "evt_1",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_1",
              metadata: { organizationId: "org-1" },
              customer: "cus_1",
              subscription: "sub_1",
            },
          },
        }),
      }) as unknown as Parameters<(typeof route)["POST"]>[0],
    );

    expect(res.status).toBe(200);
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        billingStatus: "active",
        plan: "pro",
      },
    });
  });
});
