import { describe, expect, it } from "vitest";
import { checkApprovalAttempt } from "../src/bank/approvals-guard.js";
import { loadDemoPack, packRoles } from "../src/packs/load.js";

describe("approval guards (roles from demo.banking pack)", () => {
  const ladder = packRoles(loadDemoPack("banking"));

  it("scenario 2: lower role refused; required role ok", () => {
    const refused = checkApprovalAttempt(ladder, {
      actor_membership_id: "m1",
      actor_email: "officer@demo.test",
      actor_roles: ["credit_officer"],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("insufficient_role");

    const ok = checkApprovalAttempt(ladder, {
      actor_membership_id: "m2",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
    });
    expect(ok.ok).toBe(true);
  });

  it("scenario 3: requester refused; reason_code required", () => {
    const self = checkApprovalAttempt(ladder, {
      actor_membership_id: "m1",
      actor_email: "requester@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: true,
      action: "approve",
      required_role: "credit_manager",
      required_fields: ["reason_code", "comment"],
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.code).toBe("separation_of_duties");

    const noReason = checkApprovalAttempt(ladder, {
      actor_membership_id: "m2",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
      required_fields: ["reason_code", "comment"],
      comment: "looks fine",
    });
    expect(noReason.ok).toBe(false);

    const approved = checkApprovalAttempt(ladder, {
      actor_membership_id: "m2",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
      required_fields: ["reason_code", "comment"],
      reason_code: "MODEL_OVERRIDE",
      comment: "customer history supports approval",
    });
    expect(approved.ok).toBe(true);
  });

  it("scenario 6: callback_verified required to approve", () => {
    const bad = checkApprovalAttempt(ladder, {
      actor_membership_id: "m1",
      actor_email: "ops@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "approve",
      required_fields: ["callback_verified"],
      callback_verified: false,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("callback_required");
  });

  it("scenario 7: hard stop release needs configured high role + reason", () => {
    const manager = checkApprovalAttempt(ladder, {
      actor_membership_id: "m1",
      actor_email: "manager@demo.test",
      actor_roles: ["credit_manager"],
      is_requester: false,
      action: "release",
      hard_stop: true,
    });
    expect(manager.ok).toBe(false);

    const noReason = checkApprovalAttempt(ladder, {
      actor_membership_id: "m2",
      actor_email: "head@demo.test",
      actor_roles: ["head_of_compliance"],
      is_requester: false,
      action: "release",
      hard_stop: true,
    });
    expect(noReason.ok).toBe(false);

    const released = checkApprovalAttempt(ladder, {
      actor_membership_id: "m2",
      actor_email: "head@demo.test",
      actor_roles: ["head_of_compliance"],
      is_requester: false,
      action: "release",
      hard_stop: true,
      reason_code: "FALSE_POSITIVE_REVIEWED",
      comment: "documented false positive",
    });
    expect(released.ok).toBe(true);
  });

  it("scenario 5: repeated self-approval each refused", () => {
    for (let i = 0; i < 3; i++) {
      const r = checkApprovalAttempt(ladder, {
        actor_membership_id: "m1",
        actor_email: "requester@demo.test",
        actor_roles: ["credit_manager"],
        is_requester: true,
        action: "approve",
        required_role: "credit_manager",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("separation_of_duties");
    }
  });
});
