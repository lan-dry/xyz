import { describe, expect, it } from "vitest";
import { formatRoleLabel } from "../src/bank/describe-decision.js";
import { roleDisplayName } from "../src/bank/rule-preview.js";
import type { BankRole } from "../src/bank/authority-matrix.js";
import { describeDecision } from "../src/bank/describe-decision.js";
import { custodyLabel } from "../src/crypto/receipt-signing.js";

describe("A1 role labels", () => {
  it("maps credit_manager to Credit Manager (not Approver)", () => {
    expect(formatRoleLabel("credit_manager")).toBe("Credit Manager");
    expect(formatRoleLabel("approver")).toBe("Approver");
  });

  it("prefers ladder display_name for snapshotted labels", () => {
    const ladder: BankRole[] = [
      {
        role_key: "credit_manager",
        display_name: "Credit Manager",
        level: 2,
      },
    ];
    expect(roleDisplayName(ladder, "credit_manager")).toBe("Credit Manager");
  });

  it("sealed label stays put when live ladder display changes", () => {
    const sealedLabel = "Credit Manager";
    const ladderAfter: BankRole[] = [
      {
        role_key: "credit_manager",
        display_name: "Senior Credit Manager",
        level: 2,
      },
    ];
    expect(sealedLabel).toBe("Credit Manager");
    expect(roleDisplayName(ladderAfter, "credit_manager")).toBe(
      "Senior Credit Manager",
    );
    expect(sealedLabel).not.toBe(
      roleDisplayName(ladderAfter, "credit_manager"),
    );
  });
});

describe("A6 custody label", () => {
  it("labels software keys as demo tenant, never development", () => {
    expect(custodyLabel("software")).toBe(
      "Key custody: software key (demo tenant)",
    );
    expect(custodyLabel("software")).not.toMatch(/development/i);
    expect(custodyLabel("software_interim")).toBe(
      "Key custody: software key (interim)",
    );
  });
});

describe("A7 requires-a grammar", () => {
  it("uses Credit Manager with correct article on hold and approved", () => {
    const hold = describeDecision({
      outcome: "hold",
      product: "retail_loan",
      event_type: "loan_disbursement",
      amount: 12_000_000,
      currency: "RWF",
      required_role: "credit_manager",
      required_role_label: "Credit Manager",
      decided_by_rule_id: "LN-07",
      matched_rules: [{ rule_id: "LN-07", decision: "hold" }],
    });
    expect(hold).toMatch(/requires a Credit Manager/);
    expect(hold).not.toMatch(/requires a Approver/);

    const approved = describeDecision({
      outcome: "approved",
      product: "retail_loan",
      event_type: "loan_disbursement",
      amount: 12_000_000,
      currency: "RWF",
      required_role: "credit_manager",
      required_role_label: "Credit Manager",
      decided_by_rule_id: "LN-07",
      matched_rules: [{ rule_id: "LN-07", decision: "hold" }],
      approver_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_at: "2026-11-18T10:00:00.000Z",
      approval_reason: "Within branch limit",
    });
    expect(approved).toMatch(/requires a Credit Manager/);
    expect(approved).toMatch(/Jean Mutabazi · Credit Manager/);
    expect(approved).not.toMatch(/requires a Approver/);
  });
});
