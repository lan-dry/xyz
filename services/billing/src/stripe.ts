import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}

export function constructStripeWebhookEvent(
  rawBody: string,
  signature: string,
  secret: string,
): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
