import { describe, expect, it } from "vitest";
import {
  evaluateConsoleApprovalAttempt,
  isRequesterFromPayload,
} from "../src/bank/console-approval-guard.js";
import { loadDemoPack, packRoles } from "../src/packs/load.js";

describe("console approval guard wiring (no DB)", () => {
  const ladder = packRoles(loadDemoPack("banking"));
  const base = {
    actor_membership_id: "mem-1",
    actor_email: "manager@demo.test",
    actor_roles: ["credit_manager"] as string[],
    is_requester: false,
    action: "approve" as const,
    ladder,
    bankRolesAvailable: true,
  };

  it("insufficient role returns insufficient_role", () => {
    const result = evaluateConsoleApprovalAttempt({
      ...base,
      actor_roles: ["credit_officer"],
      metadata: { required_role: "credit_manager" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("insufficient_role");
  });

  it("skips role checks when bank tables unavailable", () => {
    const result = evaluateConsoleApprovalAttempt({
      ...base,
      actor_roles: [],
      bankRolesAvailable: false,
      metadata: { required_role: "credit_manager" },
    });
    expect(result.ok).toBe(true);
  });

  it("requester self-approve is separation_of_duties", () => {
    const result = evaluateConsoleApprovalAttempt({
      ...base,
      is_requester: true,
      metadata: { required_role: "credit_manager" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("separation_of_duties");
  });

  it("requester self-reject is also blocked", () => {
    const result = evaluateConsoleApprovalAttempt({
      ...base,
      action: "reject",
      is_requester: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("separation_of_duties");
  });

  it("required_fields from metadata enforce reason_code and comment", () => {
    const missing = evaluateConsoleApprovalAttempt({
      ...base,
      metadata: {
        required_role: "credit_manager",
        required_fields: ["reason_code", "comment"],
      },
      body: { comment: "ok" },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("reason_required");

    const ok = evaluateConsoleApprovalAttempt({
      ...base,
      metadata: {
        required_role: "credit_manager",
        required_fields: ["reason_code", "comment"],
      },
      body: { reason_code: "MODEL_OVERRIDE", comment: "customer history" },
    });
    expect(ok.ok).toBe(true);
  });

  it("required_fields from request body can require callback_verified", () => {
    const bad = evaluateConsoleApprovalAttempt({
      ...base,
      body: {
        required_fields: ["callback_verified"],
        callback_verified: false,
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("callback_required");

    const ok = evaluateConsoleApprovalAttempt({
      ...base,
      body: {
        required_fields: ["callback_verified"],
        callback_verified: true,
      },
    });
    expect(ok.ok).toBe(true);
  });

  it("isRequesterFromPayload matches requester_email", () => {
    expect(
      isRequesterFromPayload(
        { requester_email: "Requester@Demo.Test" },
        "requester@demo.test",
      ),
    ).toBe(true);
    expect(
      isRequesterFromPayload(
        { requester_email: "other@demo.test" },
        "requester@demo.test",
      ),
    ).toBe(false);
  });
});
