import { NextResponse } from "next/server";

import { withConsoleOrg } from "@/lib/console/api-route";
import { roleMeetsMinimum } from "@/lib/console/roles";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "viewer", async (scoped) => {
    const organization = await prisma.organization.findUnique({
      where: { id: scoped.activeOrgId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        billingStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        billingStatus: organization.billingStatus,
      },
      canManageBilling: roleMeetsMinimum(scoped.membership.role, "admin"),
      hasCustomer: Boolean(organization.stripeCustomerId),
      hasSubscription: Boolean(organization.stripeSubscriptionId),
      usage: {
        eventsThisMonth: null,
        seats: null,
      },
      testMode: true,
    });
  });
}
