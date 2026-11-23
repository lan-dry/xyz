/**
 * Gate 0: tenant A must never read or write tenant B resources.
 * Covers console session org binding and inventory deny-by-default.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ConsoleSession } from "@salanor/platform-auth";
import { canReadOrgConsole, canWriteOrgConsole } from "@salanor/platform-auth";
import {
  CONSOLE_ROUTE_RULES,
  AEGIS_ROUTE_RULES,
} from "../src/auth/route-inventory.js";
import { assertCanSetTenantKind, isWipeableOrg } from "../src/tenants/tenant-kind.js";
import { rejectNonSyntheticPayload } from "../src/tenants/synthetic-guard.js";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function session(orgId: string, role = "admin"): ConsoleSession {
  return {
    sessionId: "sess-iso",
    userId: "mem-iso",
    accountId: "acc-iso",
    organizationId: orgId,
    email: "iso@example.com",
    displayName: "Iso",
    role,
  };
}

describe("tenant isolation — session org binding", () => {
  it("refuses cross-org console read/write helpers", () => {
    const a = session(ORG_A);
    expect(canReadOrgConsole(a, ORG_A)).toBe(true);
    expect(canWriteOrgConsole(a, ORG_A)).toBe(true);
    expect(canReadOrgConsole(a, ORG_B)).toBe(false);
    expect(canWriteOrgConsole(a, ORG_B)).toBe(false);
  });

  it("auditor cannot write or approve", () => {
    const auditor = session(ORG_A, "auditor");
    expect(canWriteOrgConsole(auditor, ORG_A)).toBe(false);
  });
});

describe("tenant isolation — unauthenticated routes stay closed", () => {
  const app = createApp();

  for (const route of [...CONSOLE_ROUTE_RULES, ...AEGIS_ROUTE_RULES].slice(0, 40)) {
    const path = route.path
      .replace(":policyId", "pol_x")
      .replace(":eventId", "evt_x")
      .replace(":traceId", "tr_x")
      .replace(":reportId", "sealed_receipts")
      .replace(":sourceId", "src_x")
      .replace(":keyId", "key_x")
      .replace(":exceptionId", "rex_x")
      .replace(":feedId", "feed_x")
      .replace(":runId", "rr_x")
      .replace(":id", "apr_x");
    it(`${route.method} ${route.path} rejects anonymous callers`, async () => {
      const res = await app.request(path, {
        method: route.method,
        headers: {
          "Content-Type": "application/json",
          // Guessed foreign org — must not unlock anything without a real session.
          "X-Organization-Id": ORG_B,
        },
        body: ["POST", "PUT", "PATCH"].includes(route.method) ? "{}" : undefined,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("tenant kind immutability", () => {
  it("blocks sandbox → real", () => {
    const r = assertCanSetTenantKind("sandbox", "real");
    expect(r.ok).toBe(false);
  });

  it("allows wipe only for demo/test/sandbox", () => {
    expect(isWipeableOrg({ tenant_kind: "sandbox" })).toBe(true);
    expect(isWipeableOrg({ is_demo: true })).toBe(true);
    expect(isWipeableOrg({ tenant_kind: "real" })).toBe(false);
  });
});

describe("sandbox synthetic guard", () => {
  it("rejects card-like numbers", () => {
    const hit = rejectNonSyntheticPayload({
      attributes: { pan: "4111111111111111" },
    });
    expect(hit?.code).toBe("synthetic_data_required");
  });

  it("allows demo-shaped loan attributes", () => {
    const hit = rejectNonSyntheticPayload({
      attributes: {
        amount: 1_200_000,
        currency: "RWF",
        applicant_name: "Uwase Aline",
        beneficiary_account: "ACCT-DEMO-001",
      },
    });
    expect(hit).toBeNull();
  });
});
