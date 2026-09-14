import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  type StripeWebhookEvent,
  getStripeWebhookSecret,
  mapStripeSubscriptionStatus,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function parseStripeEvent(req: NextRequest): Promise<StripeWebhookEvent> {
  const body = await req.text();
  const webhookSecret = getStripeWebhookSecret();
  const shouldVerifySignature = Boolean(webhookSecret) && process.env.NODE_ENV !== "test";

  if (shouldVerifySignature) {
    const signature = (await headers()).get("stripe-signature");
    if (!signature) {
      throw new Error("Missing stripe-signature header");
    }
    if (!verifyStripeWebhookSignature(body, signature, webhookSecret)) {
      throw new Error("Stripe webhook signature verification failed");
    }
  }

  return JSON.parse(body) as StripeWebhookEvent;
}

async function findOrgForCheckoutSession(session: Record<string, unknown>) {
  const metadata =
    typeof session.metadata === "object" && session.metadata
      ? (session.metadata as Record<string, unknown>)
      : {};
  const metadataOrgId = typeof metadata.organizationId === "string" ? metadata.organizationId : undefined;
  if (metadataOrgId) {
    return prisma.organization.findUnique({
      where: { id: metadataOrgId },
      select: { id: true },
    });
  }

  if (typeof session.customer === "string") {
    return prisma.organization.findFirst({
      where: { stripeCustomerId: session.customer },
      select: { id: true },
    });
  }
  return null;
}

export async function POST(req: NextRequest) {
  let event: StripeWebhookEvent;
  try {
    event = await parseStripeEvent(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid webhook payload" },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const organization = await findOrgForCheckoutSession(session);
    if (organization) {
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          billingStatus: "active",
          plan: "pro",
        },
      });
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    const subscriptionId = typeof subscription.id === "string" ? subscription.id : "";
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
    const status = typeof subscription.status === "string" ? subscription.status : null;
    if (!subscriptionId) {
      return NextResponse.json({ received: true });
    }

    const orConditions: Array<{ stripeCustomerId?: string; stripeSubscriptionId?: string }> = [
      { stripeSubscriptionId: subscriptionId },
    ];
    if (customerId) {
      orConditions.push({ stripeCustomerId: customerId });
    }
    const organization = await prisma.organization.findFirst({
      where: {
        OR: orConditions,
      },
      select: { id: true },
    });

    if (organization) {
      const mappedStatus = mapStripeSubscriptionStatus(status);
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          stripeSubscriptionId: subscriptionId,
          billingStatus: mappedStatus,
          plan: mappedStatus === "active" || mappedStatus === "trialing" ? "pro" : "starter",
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
