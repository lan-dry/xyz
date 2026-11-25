import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  assertCanSetTenantKind,
  isWipeableOrg,
} from "../src/tenants/tenant-kind.js";
import { rejectNonSyntheticPayload, blockSandboxIngest } from "../src/tenants/synthetic-guard.js";
import { buildSandboxTestEvent, SANDBOX_TEST_SCENARIOS } from "../src/tenants/sandbox-test-sender.js";
import { sandboxDaysRemaining } from "../src/tenants/tenant-copy.js";

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

  it("allows real → sandbox and refuses demo → real", () => {
    expect(assertCanSetTenantKind("real", "sandbox").ok).toBe(true);
    expect(assertCanSetTenantKind("demo", "real").ok).toBe(false);
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

  it("sandbox reset rejects anonymous", async () => {
    const app = createApp();
    const res = await app.request("/v1/console/sandbox/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_name: "RESET SANDBOX" }),
    });
    expect(res.status).toBe(401);
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

  it("refuses personal email and real-looking phone numbers in sandbox payloads", () => {
    expect(
      rejectNonSyntheticPayload({
        attributes: { requester_email: "person@gmail.com" },
      })?.code,
    ).toBe("synthetic_data_required");
    expect(
      blockSandboxIngest(
        { tenant_kind: "sandbox" },
        { attributes: { phone: "078812345678" } },
      )?.code,
    ).toBe("synthetic_data_required");
    expect(
      blockSandboxIngest({ tenant_kind: "real" }, { attributes: { phone: "078812345678" } }),
    ).toBeNull();
  });

  it("builds five synthetic scenarios the guard accepts", () => {
    for (const scenario of SANDBOX_TEST_SCENARIOS) {
      const built = buildSandboxTestEvent(scenario);
      expect(built.scenario).toBe(scenario);
      expect(rejectNonSyntheticPayload(built.event)).toBeNull();
    }
  });

  it("counts sandbox days remaining", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(sandboxDaysRemaining("2026-01-03T00:00:00.000Z", now)).toBe(2);
    expect(sandboxDaysRemaining("2025-12-01T00:00:00.000Z", now)).toBe(0);
    expect(sandboxDaysRemaining(null)).toBeNull();
  });
});
