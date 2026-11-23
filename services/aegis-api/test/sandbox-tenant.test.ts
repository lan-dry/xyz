import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  assertCanSetTenantKind,
  isWipeableOrg,
} from "../src/tenants/tenant-kind.js";
import { rejectNonSyntheticPayload } from "../src/tenants/synthetic-guard.js";

describe("sandbox tenant policy", () => {
  it("sandbox is wipeable; real is not", () => {
    expect(isWipeableOrg({ tenant_kind: "sandbox" })).toBe(true);
    expect(isWipeableOrg({ tenant_kind: "real", is_demo: false, is_test: false })).toBe(
      false,
    );
  });

  it("cannot promote sandbox to real", () => {
    expect(assertCanSetTenantKind("sandbox", "real").ok).toBe(false);
  });

  it("test-events route rejects anonymous", async () => {
    const app = createApp();
    const res = await app.request("/v1/console/sandbox/test-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "routine" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("access-request refuses gmail", async () => {
    const app = createApp();
    const res = await app.request("/v1/public/access-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_email: "a@gmail.com",
        company: "Co",
        role: "Risk",
        country: "RW",
        use_case: "Try sandbox",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("synthetic guard allows demo accounts", () => {
    expect(
      rejectNonSyntheticPayload({
        attributes: { beneficiary_account: "ACCT-DEMO-001", amount: 100 },
      }),
    ).toBeNull();
  });
});
