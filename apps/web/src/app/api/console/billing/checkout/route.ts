import { NextRequest, NextResponse } from "next/server";

import {
  createStripeCheckoutSession,
  createStripeCustomer,
  getProPriceId,
  isStripeConfigured,
} from "@/lib/billing/stripe";
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

    const priceId = getProPriceId();
    if (!priceId) {
      return NextResponse.json(
        { error: "No Stripe Pro price is configured (set STRIPE_PRICE_PRO_ID)." },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: scoped.activeOrgId },
      select: {
        id: true,
        name: true,
        slug: true,
        stripeCustomerId: true,
      },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let customerId = organization.stripeCustomerId;
    if (!customerId) {
      const customer = await createStripeCustomer({
        name: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = new URL(req.url).origin;
    const session = await createStripeCheckoutSession({
      customerId,
      priceId,
      successUrl: `${baseUrl}/console/billing?checkout=success`,
      cancelUrl: `${baseUrl}/console/billing?checkout=cancel`,
      organizationId: organization.id,
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "billing.checkout_session_created",
      targetType: "billing_checkout",
      targetId: session.id,
      metadata: { priceId, customerId },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  });
}
