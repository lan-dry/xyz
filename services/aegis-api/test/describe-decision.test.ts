import { describe, expect, it } from "vitest";
import {
  actionLabel,
  dedupeRuleLabels,
  describeDecision,
  formatApprover,
  formatRuleLabel,
} from "../src/bank/describe-decision.js";

describe("describeDecision", () => {
  it("does not invent a currency when none is provided", () => {
    const text = describeDecision({
      outcome: "allow",
      product: "claim_payout",
      amount: 8000,
      decided_by_rule_id: "CLM-01",
    });
    expect(text).not.toMatch(/RWF/);
    expect(text).toMatch(/Claim payout of 8,000/);
  });

  it("describes an automatic allow within officer limit", () => {
    const text = describeDecision({
      outcome: "allow",
      product: "retail_loan",
      event_type: "loan_decision",
      amount: 1_200_000,
      currency: "RWF",
      policy_version: 3,
      decided_by_rule_id: "AUTH-RL",
      matched_rules: [{ rule_id: "AUTH-RL", decision: "allow" }],
    });
    expect(text).toMatch(/Loan disbursement of RWF 1,200,000/);
    expect(text).toMatch(/AUTH-RL/);
    expect(text).toMatch(/No human approval was needed/);
    expect(text).toMatch(/Policy v3/);
    expect(text).not.toMatch(/governed\.action/);
    expect(text).not.toMatch(/policy_decision/);
  });

  it("describes a hold for credit manager", () => {
    const text = describeDecision({
      outcome: "hold",
      product: "retail_loan",
      amount: 18_000_000,
      currency: "RWF",
      policy_version: 3,
      decided_by_rule_id: "LN-07",
      required_role: "credit_manager",
      required_role_label: "Credit Manager",
    });
    expect(text).toMatch(/RWF 18,000,000/);
    expect(text).toMatch(/held/i);
    expect(text).toMatch(/Credit Manager/);
    expect(text).not.toMatch(/governed\.action/);
  });

  it("describes released with approver and reason", () => {
    const text = describeDecision({
      outcome: "released",
      product: "retail_loan",
      amount: 18_000_000,
      currency: "RWF",
      decided_by_rule_id: "LN-07",
      required_role_label: "Credit Manager",
      approver_name: "Jean Mutabazi",
      approver_role: "Credit Manager",
      approved_at: "2026-11-15T18:21:00.000Z",
      approval_reason: "Within manager band after KYC refresh",
      policy_version: 3,
    });
    expect(text).toMatch(/Jean Mutabazi/);
    expect(text).toMatch(/15 Nov 2026 at 18:21 UTC/);
    expect(text).toMatch(/Within manager band/);
  });
});


describe("event labels come from event_type first", () => {
  it("labels payments, KYC and loans correctly", () => {
    expect(actionLabel("retail_loan", "payment_transfer")).toBe("Payment release");
    expect(actionLabel("retail_loan", "data_access")).toBe("Customer data access");
    expect(actionLabel("retail_loan", "loan_decision")).toBe("Loan disbursement");
    expect(actionLabel("retail_loan", null)).toBe("Loan disbursement");
  });

  it("describes a payment on a loan product as a payment release", () => {
    const text = describeDecision({
      outcome: "hold",
      product: "retail_loan",
      event_type: "payment_transfer",
      amount: 900_000,
      currency: "RWF",
      required_role_label: "Credit Manager",
      decided_by_rule_id: "PAY-03",
    });
    expect(text).toMatch(/^Payment release of RWF 900,000/);
    expect(text).not.toMatch(/Loan disbursement/);
  });
});

describe("rule labels", () => {
  it("never shows a raw policy UUID", () => {
    expect(formatRuleLabel("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBeNull();
    const text = describeDecision({
      outcome: "hold",
      product: "retail_loan",
      amount: 18_000_000,
      currency: "RWF",
      decided_by_rule_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      required_role_label: "Credit Manager",
    });
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("extracts the code from stored pack rule ids", () => {
    expect(formatRuleLabel("pol_pack_demo_banking_3b9f7043_LN-07")).toMatch(/^LN-07 · /);
    expect(formatRuleLabel("pol_pack_demo_banking_3b9f7043_AUTH-RL", "allow")).toBe(
      "AUTH-RL · Within officer limit",
    );
  });

  it("calls AUTH-RL on a hold 'Above officer limit', never 'Within'", () => {
    expect(formatRuleLabel("AUTH-RL", "allow")).toBe("AUTH-RL · Within officer limit");
    expect(formatRuleLabel("AUTH-RL", "hold")).toBe("AUTH-RL · Above officer limit");
    expect(formatRuleLabel("AUTH-RL", "stop")).toBe("AUTH-RL · Above officer limit");
  });

  it("dedupes AUTH-RL, AUTH-RL", () => {
    expect(
      dedupeRuleLabels(["AUTH-RL", "pol_pack_demo_banking_3b9f7043_AUTH-RL"], "allow"),
    ).toEqual(["AUTH-RL · Within officer limit"]);
  });
});

describe("held because the hold rule, not the allow rule", () => {
  it("uses decision_basis.decided_by_rule_id", () => {
    const text = describeDecision({
      outcome: "hold",
      product: "retail_loan",
      amount: 2_000_000,
      currency: "RWF",
      matched_rules: [
        { rule_id: "AUTH-RL", decision: "allow" },
        { rule_id: "LN-07", decision: "allow_with_obligation" },
      ],
      decision_basis: { decided_by_rule_id: "LN-07" } as never,
      required_role_label: "Credit Manager",
    });
    expect(text).toMatch(/because rule LN-07/);
    expect(text).not.toMatch(/because rule AUTH-RL · Within/);
  });
});

describe("declined and approver wording", () => {
  it("reads 'declined by Name · Role on date, reason: ...'", () => {
    const text = describeDecision({
      outcome: "declined",
      product: "retail_loan",
      amount: 25_000_000,
      currency: "RWF",
      decided_by_rule_id: "AUTH-RL",
      required_role_label: "Credit Manager",
      approver_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_at: "2026-11-15T10:05:00.000Z",
      approval_reason: "Collateral not verified",
    });
    expect(text).toMatch(
      /declined by Jean Mutabazi · Credit Manager on 15 Nov 2026 at 10:05 UTC, reason: Collateral not verified/,
    );
    expect(text).toMatch(/held because rule AUTH-RL · Above officer limit requires a Credit Manager/);
  });

  it("formats approvers as 'Name · Role' and never leaks an email", () => {
    expect(formatApprover("Jean Mutabazi", "credit_manager")).toBe("Jean Mutabazi · Credit Manager");
    expect(formatApprover("Aimee Nyirahabimana", null)).toBe("Aimee Nyirahabimana");
    expect(formatApprover(null, "credit_manager")).toBeNull();
  });
});
