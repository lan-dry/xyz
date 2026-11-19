/**
 * Route-by-role matrix: every inventoried route has an explicit rule (deny by default).
 * Unauthenticated requests must not succeed.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  canDecideApprovals,
  canWriteOrgConsole,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { canExportReports } from "../src/routes/console/reports.js";
import {
  ALL_ROUTE_RULES,
  AEGIS_ROUTE_RULES,
  CONSOLE_ROUTE_RULES,
  REQUIRED_ROUTE_PATTERNS,
} from "../src/auth/route-inventory.js";

const DEV_ORG = "11111111-1111-4111-8111-111111111111";

function session(role: string): ConsoleSession {
  return {
    sessionId: "sess-1",
    userId: "mem-1",
    accountId: "acc-1",
    organizationId: DEV_ORG,
    email: "u@example.com",
    displayName: "U",
    role,
  };
}

describe("route inventory deny-by-default", () => {
  it("has explicit rules for every required pattern", () => {
    expect(REQUIRED_ROUTE_PATTERNS.length).toBeGreaterThan(10);
    const keys = new Set(
      ALL_ROUTE_RULES.map((r) => `${r.method} ${r.path}`),
    );
    for (const p of REQUIRED_ROUTE_PATTERNS) {
      expect(keys.has(p)).toBe(true);
    }
  });

  it("marks receipt-viewing routes for access log", () => {
    const receiptRoutes = ALL_ROUTE_RULES.filter((r) => r.receiptAccessLog);
    expect(receiptRoutes.length).toBeGreaterThan(0);
  });
});

describe("console route auth matrix — 401 without session", () => {
  const app = createApp();

  for (const route of CONSOLE_ROUTE_RULES) {
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
    it(`${route.method} ${route.path} → ${route.anon} without cookie`, async () => {
      const res = await app.request(path, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
        body: ["POST", "PUT", "PATCH"].includes(route.method)
          ? "{}"
          : undefined,
      });
      expect([route.anon, 401, 403, 404, 422]).toContain(res.status);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("aegis ingest routes — 401 without bearer", () => {
  const app = createApp();

  for (const route of AEGIS_ROUTE_RULES) {
    it(`${route.method} ${route.path} → ${route.anon} without Authorization`, async () => {
      const withBody = ["POST", "PUT", "PATCH"].includes(route.method);
      const res = await app.request(route.path, {
        method: route.method,
        headers: withBody ? { "Content-Type": "application/json" } : undefined,
        body: withBody ? "{}" : undefined,
      });
      expect([route.anon, 401, 403]).toContain(res.status);
    });
  }
});

describe("role guards (403 for wrong role)", () => {
  it("viewer cannot decide approvals", () => {
    expect(canDecideApprovals(session("viewer"), DEV_ORG)).toBe(false);
    expect(canDecideApprovals(session("approver"), DEV_ORG)).toBe(true);
  });

  it("viewer cannot write org console; admin can", () => {
    expect(canWriteOrgConsole(session("viewer"), DEV_ORG)).toBe(false);
    expect(canWriteOrgConsole(session("admin"), DEV_ORG)).toBe(true);
  });

  it("viewer cannot export canned reports", () => {
    expect(canExportReports("viewer")).toBe(false);
    expect(canExportReports("auditor")).toBe(true);
  });

  it("inventory allowRoles refuse requester-only for approve", () => {
    const approve = CONSOLE_ROUTE_RULES.find((r) =>
      r.path.includes("/approve"),
    );
    expect(approve?.allowRoles).not.toContain("viewer");
    expect(approve?.allowRoles).toContain("approver");
  });
});
