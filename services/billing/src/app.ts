import { Hono } from "hono";
import { cors } from "hono/cors";
import type Stripe from "stripe";
import { getPool } from "./db.js";
import { constructStripeWebhookEvent, getStripe } from "./stripe.js";
import {
  applyCheckoutSessionCompleted,
  applySubscriptionChange,
} from "./webhook-handlers.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: consoleOrigin,
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", service: "billing" }));

function orgSettingsUrl(suffix = ""): string {
  const base = consoleOrigin.replace(/\/$/, "");
  return `${base}/aegis/settings/organization${suffix}`;
}

/** Stripe Checkout session — requires STRIPE_SECRET_KEY and plan stripe_price_id. */
app.post("/v1/billing/checkout/session", async (c) => {
  let stripeKey: string;
  try {
    getStripe();
    stripeKey = process.env.STRIPE_SECRET_KEY!.trim();
  } catch {
    return c.json(
      {
        error: "Billing not configured",
        hint: "Set STRIPE_SECRET_KEY to enable checkout",
      },
      503,
    );
  }

  let body: {
    organization_id?: string;
    plan_slug?: string;
    success_url?: string;
    cancel_url?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!body.organization_id || !body.plan_slug) {
    return c.json({ error: "organization_id and plan_slug required" }, 422);
  }

  const pool = getPool();
  const plan = await pool.query<{
    stripe_price_id: string | null;
    self_serve: boolean;
  }>(
    `SELECT stripe_price_id, self_serve FROM plan_catalog
     WHERE plan_slug = $1 AND active = true`,
    [body.plan_slug],
  );
  const row = plan.rows[0];
  if (!row?.self_serve) {
    return c.json({ error: "Plan is not available for self-serve checkout" }, 422);
  }
  if (!row.stripe_price_id) {
    return c.json(
      {
        error: "Stripe price not configured for this plan",
        hint: "Set stripe_price_id on plan_catalog via Platform → Plans",
      },
      422,
    );
  }

  const org = await pool.query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM organization WHERE organization_id = $1`,
    [body.organization_id],
  );
  if (!org.rows[0]) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const successUrl = body.success_url ?? orgSettingsUrl("?checkout=success");
  const cancelUrl = body.cancel_url ?? orgSettingsUrl("?checkout=cancel");

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("line_items[0][price]", row.stripe_price_id);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", body.organization_id);
  params.set("metadata[organization_id]", body.organization_id);
  params.set("metadata[plan_slug]", body.plan_slug);
  params.set("subscription_data[metadata][organization_id]", body.organization_id);
  params.set("subscription_data[metadata][plan_slug]", body.plan_slug);

  const existingCustomer = org.rows[0].stripe_customer_id?.trim();
  if (existingCustomer) {
    params.set("customer", existingCustomer);
  } else {
    params.set("customer_creation", "always");
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok) {
    return c.json({ error: data.error?.message ?? "Stripe checkout failed" }, 502);
  }
  return c.json({ checkout_url: data.url });
});

/** Stripe Customer Portal — invoices and payment method (B-122). */
app.post("/v1/billing/portal/session", async (c) => {
  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return c.json(
      {
        error: "Billing not configured",
        hint: "Set STRIPE_SECRET_KEY to enable the customer portal",
      },
      503,
    );
  }

  let body: { organization_id?: string; return_url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!body.organization_id) {
    return c.json({ error: "organization_id required" }, 422);
  }

  const pool = getPool();
  const org = await pool.query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM organization WHERE organization_id = $1`,
    [body.organization_id],
  );
  const customerId = org.rows[0]?.stripe_customer_id?.trim();
  if (!customerId) {
    return c.json(
      {
        error: "No Stripe customer for this organization",
        hint: "Complete checkout once to open billing portal",
      },
      422,
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: body.return_url ?? orgSettingsUrl(),
  });

  return c.json({ portal_url: session.url });
});

/** Stripe webhooks — signature verified via constructEvent (B-124). */
app.post("/v1/billing/webhooks/stripe", async (c) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return c.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      503,
    );
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return c.json({ error: message }, 400);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await applyCheckoutSessionCompleted(
          client,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscriptionChange(
          client,
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }
  } finally {
    client.release();
  }

  return c.json({ received: true, type: event.type });
});
