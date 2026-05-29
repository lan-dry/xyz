import { NextRequest, NextResponse } from "next/server";

import { createStripePortalSession, isStripeConfigured } from "@/lib/billing/stripe";
import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: scoped.activeOrgId },
      select: { id: true, stripeCustomerId: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (!organization.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer found for this org" }, { status: 400 });
    }

    const portal = await createStripePortalSession({
      customerId: organization.stripeCustomerId,
      returnUrl: `${new URL(req.url).origin}/console/billing`,
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "billing.portal_session_created",
      targetType: "billing_portal",
      targetId: portal.id,
      metadata: { customerId: organization.stripeCustomerId },
    });

    return NextResponse.json({
      url: portal.url,
    });
  });
}
