import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createApp } from "../src/app.js";
import { canExportReports } from "../src/routes/console/reports.js";
import type { ConsoleSession } from "@salanor/platform-auth";

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

describe("governed/bank event auth", () => {
  it("returns 401 without Authorization on governed/events", async () => {
    const app = createApp();
    const res = await app.request("/v1/aegis/governed/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 without Authorization on bank/events", async () => {
    const app = createApp();
    const res = await app.request("/v1/aegis/bank/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 without Authorization on governed/events/batch", async () => {
    const app = createApp();
    const res = await app.request("/v1/aegis/governed/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", text: "a\n1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 without Authorization on bank/events/batch", async () => {
    const app = createApp();
    const res = await app.request("/v1/aegis/bank/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", text: "a\n1" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("canned report export roles", () => {
  it("allows auditor/admin/owner and forbids viewer", () => {
    expect(canExportReports(session("auditor").role)).toBe(true);
    expect(canExportReports(session("admin").role)).toBe(true);
    expect(canExportReports(session("owner").role)).toBe(true);
    expect(canExportReports(session("viewer").role)).toBe(false);
    expect(canExportReports(session("engineer").role)).toBe(false);
  });

  it("report route returns 403 for viewer via same gate as console reports", async () => {
    const app = new Hono();
    app.get("/reports/canned", (c) => {
      const role = c.req.header("x-test-role") ?? "viewer";
      if (!canExportReports(role)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json({ ok: true });
    });
    const forbidden = await app.request("/reports/canned", {
      headers: { "x-test-role": "viewer" },
    });
    expect(forbidden.status).toBe(403);
    const allowed = await app.request("/reports/canned", {
      headers: { "x-test-role": "auditor" },
    });
    expect(allowed.status).toBe(200);
  });
});
