import type Stripe from "stripe";
import type pg from "pg";

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

  if (customerId) {
    await client.query(
      `UPDATE organization SET stripe_customer_id = $2, updated_at = now()
       WHERE organization_id = $1`,
      [organizationId, customerId],
    );
  }

  if (planSlug) {
    await client.query(
      `UPDATE organization SET plan = $2, updated_at = now() WHERE organization_id = $1`,
      [organizationId, planSlug],
    );
  }
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

  if (customerId) {
    await client.query(
      `UPDATE organization SET stripe_customer_id = $2, updated_at = now()
       WHERE organization_id = $1`,
      [organizationId, customerId],
    );
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const planSlug =
    subscription.metadata?.plan_slug ??
    (await resolvePlanSlugFromPriceId(client, priceId));

  if (subscription.status === "active" || subscription.status === "trialing") {
    if (planSlug) {
      await client.query(
        `UPDATE organization SET plan = $2, updated_at = now() WHERE organization_id = $1`,
        [organizationId, planSlug],
      );
    }
    return;
  }

  if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired"
  ) {
    await client.query(
      `UPDATE organization SET plan = 'free', updated_at = now() WHERE organization_id = $1`,
      [organizationId],
    );
  }
}
