import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

/** Mirror Stripe signed payload format for constructEvent integration. */
function signPayload(payload: string, secret: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`;
  const digest = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

describe("Stripe webhook signing", () => {
  it("rejects tampered payload when secret is set", async () => {
    const { constructStripeWebhookEvent } = await import("../src/stripe.js");
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const ts = Math.floor(Date.now() / 1000);
    const goodSig = signPayload(payload, "whsec_test_secret", ts);

    expect(() =>
      constructStripeWebhookEvent(payload, goodSig, "whsec_test_secret"),
    ).not.toThrow();

    expect(() =>
      constructStripeWebhookEvent(
        payload.replace("completed", "hacked"),
        goodSig,
        "whsec_test_secret",
      ),
    ).toThrow();
  });
});
