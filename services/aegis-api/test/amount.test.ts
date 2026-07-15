import { describe, expect, it } from "vitest";
import { amountUsdFromPayload } from "../src/policy/amount.js";

describe("amountUsdFromPayload", () => {
  it("reads amount_usd", () => {
    expect(amountUsdFromPayload({ amount_usd: 2000 })).toBe(2000);
  });

  it("reads string amounts", () => {
    expect(amountUsdFromPayload({ amount: "1500.50" })).toBe(1500.5);
  });

  it("returns undefined when missing", () => {
    expect(amountUsdFromPayload({})).toBeUndefined();
  });
});
