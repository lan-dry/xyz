/**
 * Enumerate high-value console + aegis routes: 401 without auth;
 * 403 for wrong role where a guard exists (pattern from forensic-role-auth.test.ts).
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  canDecideApprovals,
  canWriteOrgConsole,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { canExportReports } from "../src/routes/console/reports.js";

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

/** Representative console paths that require a session cookie. */
const CONSOLE_PROTECTED: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/v1/console/auth/me" },
  { method: "GET", path: "/v1/console/overview" },
  { method: "GET", path: "/v1/console/approvals" },
  { method: "GET", path: "/v1/console/policies" },
  { method: "GET", path: "/v1/console/traces" },
  { method: "GET", path: "/v1/console/compliance/exports" },
  { method: "GET", path: "/v1/console/reports/canned" },
  { method: "POST", path: "/v1/console/approvals/apr_x/approve" },
  { method: "POST", path: "/v1/console/approvals/apr_x/release" },
  { method: "POST", path: "/v1/console/approvals/apr_x/escalate" },
  { method: "POST", path: "/v1/console/policies/pol_x/activate" },
];

const AEGIS_PROTECTED: Array<{ method: string; path: string }> = [
  { method: "POST", path: "/v1/aegis/governed/events" },
  { method: "POST", path: "/v1/aegis/bank/events" },
  { method: "POST", path: "/v1/aegis/approvals/request" },
  { method: "POST", path: "/v1/aegis/demo/scenarios/run" },
];

describe("console route auth matrix — 401 without session", () => {
  const app = createApp();

  for (const route of CONSOLE_PROTECTED) {
    it(`${route.method} ${route.path} → 401 without cookie`, async () => {
      const res = await app.request(route.path, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
        body: ["POST", "PUT", "PATCH"].includes(route.method)
          ? "{}"
          : undefined,
      });
      expect([401, 403]).toContain(res.status);
    });
  }
});

describe("aegis ingest routes — 401 without bearer", () => {
  const app = createApp();

  for (const route of AEGIS_PROTECTED) {
    it(`${route.method} ${route.path} → 401 without Authorization`, async () => {
      const res = await app.request(route.path, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect([401, 403]).toContain(res.status);
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
});
