import type Stripe from "stripe";
import type pg from "pg";
import { applyStripeEntitlement } from "@salanor/platform-auth";

async function resolvePlanSlugFromPriceId(
  client: pg.Pool | pg.PoolClient,
  priceId: string | null | undefined,
): Promise<string | null> {
  if (!priceId) return null;
  const row = await client.query<{ plan_slug: string }>(
    `SELECT plan_slug FROM plan_catalog WHERE stripe_price_id = $1 AND active = true`,
    [priceId],
  );
  return row.rows[0]?.plan_slug ?? null;
}

export async function applyCheckoutSessionCompleted(
  client: pg.Pool | pg.PoolClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const organizationId =
    session.metadata?.organization_id ??
    (typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : null);
  const planSlug = session.metadata?.plan_slug ?? null;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!organizationId) return;

  const invoiceId =
    typeof session.invoice === "string"
      ? session.invoice
      : session.invoice && typeof session.invoice === "object" && "id" in session.invoice
        ? String((session.invoice as { id: string }).id)
        : null;

  await applyStripeEntitlement(client, {
    organizationId,
    planSlug,
    billingStatus: planSlug ? "active" : "none",
    stripeCustomerId: customerId ?? null,
    periodStart: planSlug ? new Date() : undefined,
    invoiceRef: invoiceId,
  });
}

export async function applySubscriptionChange(
  client: pg.Pool | pg.PoolClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const organizationId = subscription.metadata?.organization_id;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!organizationId) return;

  const priceId = subscription.items.data[0]?.price?.id;
  const planSlug =
    subscription.metadata?.plan_slug ??
    (await resolvePlanSlugFromPriceId(client, priceId));

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  if (subscription.status === "active" || subscription.status === "trialing") {
    await applyStripeEntitlement(client, {
      organizationId,
      planSlug,
      billingStatus: "active",
      periodStart,
      periodEnd,
      stripeCustomerId: customerId ?? null,
    });
    return;
  }

  if (subscription.status === "past_due") {
    await applyStripeEntitlement(client, {
      organizationId,
      planSlug: null,
      billingStatus: "past_due",
      periodStart,
      periodEnd,
      stripeCustomerId: customerId ?? null,
    });
    return;
  }

  if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired"
  ) {
    await applyStripeEntitlement(client, {
      organizationId,
      planSlug: "free",
      billingStatus: "canceled",
      periodStart,
      periodEnd,
      stripeCustomerId: customerId ?? null,
    });
  }
}
