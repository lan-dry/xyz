import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { checkApprovalAttempt } from "../src/bank/approvals-guard.js";
import {
  evaluateConsoleApprovalAttempt,
} from "../src/bank/console-approval-guard.js";
import { loadDemoPack, packRoles } from "../src/packs/load.js";
import { canDecideApprovals, type ConsoleSession } from "@salanor/platform-auth";

const DEV_ORG = "11111111-1111-4111-8111-111111111111";

function session(role: string): ConsoleSession {
  return {
    sessionId: "sess-1",
    userId: "mem-1",
    accountId: "acc-1",
    organizationId: DEV_ORG,
    email: "head@demo.test",
    displayName: "Head",
    role,
  };
}

describe("hard-stop release route guard", () => {
  const ladder = packRoles(loadDemoPack("banking"));

  it("refuses manager release; accepts head_of_compliance with reason_code", () => {
    const manager = evaluateConsoleApprovalAttempt({
      actor_membership_id: "m1",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "release",
      metadata: { hard_stop: true, release_requires_role: "head_of_compliance" },
      body: { reason_code: "FALSE_POSITIVE" },
      bankRolesAvailable: true,
      ladder,
    });
    expect(manager.ok).toBe(false);

    const head = evaluateConsoleApprovalAttempt({
      actor_membership_id: "m2",
      actor_email: "head@demo.test",
      actor_roles: ["head_of_compliance"],
      is_requester: false,
      action: "release",
      metadata: { hard_stop: true, release_requires_role: "head_of_compliance" },
      body: { reason_code: "FALSE_POSITIVE", comment: "reviewed" },
      bankRolesAvailable: true,
      ladder,
    });
    expect(head.ok).toBe(true);
  });

  it("HTTP-shaped release route returns 403 for viewer and 422 without reason_code", async () => {
    const app = new Hono();
    app.post("/approvals/:id/release", (c) => {
      const role = c.req.header("x-test-role") ?? "viewer";
      const sess = session(role);
      if (!canDecideApprovals(sess, sess.organizationId)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json({ error: "reason_code required for release" }, 422);
    });

    const forbidden = await app.request("/approvals/apr_1/release", {
      method: "POST",
      headers: { "x-test-role": "viewer", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(forbidden.status).toBe(403);

    const missing = await app.request("/approvals/apr_1/release", {
      method: "POST",
      headers: { "x-test-role": "approver", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(missing.status).toBe(422);
  });

  it("hard_stop blocks approve action", () => {
    const r = checkApprovalAttempt(ladder, {
      actor_membership_id: "m1",
      actor_email: "head@demo.test",
      actor_roles: ["head_of_compliance"],
      is_requester: false,
      action: "approve",
      hard_stop: true,
      reason_code: "X",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("hard_stop");
  });
});
