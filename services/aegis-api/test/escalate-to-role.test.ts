import { afterEach, describe, expect, it } from "vitest";
import {
  applyEscalateToRoleMetadata,
  evaluateConsoleApprovalAttempt,
} from "../src/bank/console-approval-guard.js";
import { delegationStatus, listActiveDelegatedRoles } from "../src/bank/approval-delegate.js";
import { checkApprovalAttempt } from "../src/bank/approvals-guard.js";
import { isEscalationDue } from "../src/bank/escalation.js";
import { loadDemoPack, packRoles } from "../src/packs/load.js";
import { getClock, setClockForTests, type Clock } from "../src/time/clock.js";

afterEach(() => {
  setClockForTests(null);
});

function fakeClock(ms: number): Clock {
  return {
    now: () => new Date(ms),
    nowMs: () => ms,
    nowIso: () => new Date(ms).toISOString(),
  };
}

describe("escalate_to_role", () => {
  const ladder = packRoles(loadDemoPack("banking"));

  it("applyEscalateToRoleMetadata raises required_role", () => {
    const next = applyEscalateToRoleMetadata(
      { required_role: "credit_manager" },
      "head_of_compliance",
      { membership_id: "m1", email: "manager@demo.test" },
    );
    expect(next.escalate_to_role).toBe("head_of_compliance");
    expect(next.required_role).toBe("head_of_compliance");
    expect(next.required_roles).toEqual(["head_of_compliance"]);
    expect(typeof next.escalated_to_role_at).toBe("string");
  });

  it("after escalate, lower role is refused and higher role ok", () => {
    const meta = applyEscalateToRoleMetadata(
      { required_role: "credit_manager" },
      "head_of_compliance",
      { membership_id: "m1", email: "manager@demo.test" },
    );
    const manager = evaluateConsoleApprovalAttempt({
      actor_membership_id: "m2",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "approve",
      metadata: meta,
      body: { reason_code: "OK", comment: "try" },
      bankRolesAvailable: true,
      ladder,
    });
    expect(manager.ok).toBe(false);

    const head = evaluateConsoleApprovalAttempt({
      actor_membership_id: "m3",
      actor_email: "head@demo.test",
      actor_roles: ["head_of_compliance"],
      is_requester: false,
      action: "approve",
      metadata: meta,
      body: { reason_code: "OK", comment: "escalated ok" },
      bankRolesAvailable: true,
      ladder,
    });
    expect(head.ok).toBe(true);
  });
});

describe("time-bound approval_delegate", () => {
  const ladder = packRoles(loadDemoPack("banking"));

  it("expired delegate roles are excluded from active list (pure filter)", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const rows = [
      { role_key: "credit_manager", expires_at: new Date("2026-06-01T11:00:00Z") },
      { role_key: "credit_manager", expires_at: new Date("2026-06-01T13:00:00Z") },
    ];
    const active = rows
      .filter((r) => r.expires_at > now)
      .map((r) => r.role_key);
    expect(active).toEqual(["credit_manager"]);

    // Guard uses delegated role when present
    const withDelegate = checkApprovalAttempt(ladder, {
      actor_membership_id: "m_dep",
      actor_email: "deputy@demo.test",
      actor_roles: active,
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
    });
    expect(withDelegate.ok).toBe(true);

    const expiredOnly = checkApprovalAttempt(ladder, {
      actor_membership_id: "m_dep",
      actor_email: "deputy@demo.test",
      actor_roles: [],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
    });
    expect(expiredOnly.ok).toBe(false);
  });

  it("injected clock drives delegationStatus and escalation due", () => {
    const created = new Date("2026-06-01T12:00:00.000Z");
    const expires = new Date("2026-06-01T13:00:00.000Z");
    setClockForTests(fakeClock(created.getTime() + 119_000));
    expect(
      isEscalationDue(
        { escalate_after_ms: 120_000, escalate_to_role: "head_of_compliance" },
        created,
        getClock().now(),
      ),
    ).toBe(false);
    expect(delegationStatus({ expires_at: expires, revoked_at: null }, getClock().now())).toBe(
      "active",
    );
    setClockForTests(fakeClock(expires.getTime() + 1));
    expect(
      isEscalationDue(
        { escalate_after_ms: 120_000, escalate_to_role: "head_of_compliance" },
        created,
        getClock().now(),
      ),
    ).toBe(true);
    expect(delegationStatus({ expires_at: expires, revoked_at: null }, getClock().now())).toBe(
      "expired",
    );
  });

  it("listActiveDelegatedRoles returns [] when table missing", async () => {
    const fake = {
      query: async () => ({ rowCount: 0, rows: [] }),
    };
    const roles = await listActiveDelegatedRoles(
      fake as never,
      "11111111-1111-4111-8111-111111111111",
      "mem-1",
    );
    expect(roles).toEqual([]);
  });
});
