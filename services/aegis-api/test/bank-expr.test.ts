import { describe, expect, it } from "vitest";
import {
  amountExceedsMultiple,
  evalExpr,
  evalMathTerm,
} from "../src/bank/expr.js";

describe("bank attribute expressions", () => {
  const attrs = {
    amount: 18_000_000,
    currency: "RWF",
    risk_tier: "high",
    customer: { avg_payment_90d: 4_000_000 },
    tags: ["retail", "loan"],
  };

  it("supports and/or/not and comparisons", () => {
    expect(
      evalExpr(attrs, {
        and: [{ gt: ["amount", 5_000_000] }, { eq: ["currency", "RWF"] }],
      }),
    ).toBe(true);
    expect(
      evalExpr(attrs, {
        or: [{ eq: ["risk_tier", "low"] }, { eq: ["risk_tier", "high"] }],
      }),
    ).toBe(true);
    expect(evalExpr(attrs, { not: { eq: ["currency", "USD"] } })).toBe(true);
  });

  it("supports exists, in, contains", () => {
    expect(evalExpr(attrs, { exists: "customer.avg_payment_90d" })).toBe(true);
    expect(evalExpr(attrs, { exists: "missing.path" })).toBe(false);
    expect(evalExpr(attrs, { in: ["currency", ["RWF", "USD"]] })).toBe(true);
    expect(evalExpr(attrs, { contains: ["tags", "loan"] })).toBe(true);
  });

  it("supports attribute math amount > 3 * avg", () => {
    expect(
      amountExceedsMultiple(attrs, "amount", 3, "customer.avg_payment_90d"),
    ).toBe(true);
    expect(
      evalMathTerm(attrs, {
        mul: [3, { path: "customer.avg_payment_90d" }],
      }),
    ).toBe(12_000_000);
  });
});
