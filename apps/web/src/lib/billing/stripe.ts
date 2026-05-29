import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

export type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeCustomer = {
  id: string;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
}

export function getProPriceId(): string {
  return (
    process.env.STRIPE_PRICE_PRO_ID?.trim() ??
    process.env.STRIPE_PRO_PRICE_ID?.trim() ??
    ""
  );
}

export function isStripeConfigured(): boolean {
  return getStripeSecretKey().length > 0;
}

function getStripeApiBase(): string {
  return "https://api.stripe.com/v1";
}

async function stripeFormRequest<T>(path: string, body: URLSearchParams): Promise<T> {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  const response = await fetch(`${getStripeApiBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "object" && payload.error && "message" in payload.error
      ? String((payload.error as { message?: string }).message ?? "Stripe request failed")
      : "Stripe request failed";
    throw new Error(message);
  }
  return payload as T;
}

export async function createStripeCustomer(input: {
  organizationId: string;
  organizationSlug: string;
  name: string;
}): Promise<StripeCustomer> {
  const body = new URLSearchParams();
  body.set("name", input.name);
  body.set("metadata[organizationId]", input.organizationId);
  body.set("metadata[organizationSlug]", input.organizationSlug);
  return stripeFormRequest<StripeCustomer>("/customers", body);
}

export async function createStripeCheckoutSession(input: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  organizationId: string;
}): Promise<StripeCheckoutSession> {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", input.customerId);
  body.set("line_items[0][price]", input.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("metadata[organizationId]", input.organizationId);
  body.set("metadata[targetPlan]", "pro");
  return stripeFormRequest<StripeCheckoutSession>("/checkout/sessions", body);
}

export async function createStripePortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", input.returnUrl);
  return stripeFormRequest<StripePortalSession>("/billing_portal/sessions", body);
}

function parseStripeSignatureHeader(signatureHeader: string): { timestamp: string; signatures: string[] } {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((part) => part.length > 0);
  return { timestamp, signatures };
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
): boolean {
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;
  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  });
}

export function mapStripeSubscriptionStatus(status: string | null | undefined): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}
