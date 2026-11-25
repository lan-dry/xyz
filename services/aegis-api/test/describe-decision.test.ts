import { describe, expect, it } from "vitest";
import {
  actionLabel,
  decidedByLine,
  dedupeRuleLabels,
  describeDecision,
  formatApprover,
  formatRuleLabel,
  RECORD_ONLY_DECISION_LINE,
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
      decided_by_rule_id: "AUTH-RL-1",
      matched_rules: [{ rule_id: "AUTH-RL-1", decision: "allow" }],
    });
    expect(text).toMatch(/Loan disbursement of RWF 1,200,000/);
    expect(text).toMatch(/AUTH-RL-1 · Within officer limit/);
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

  it("names a fraud-score release as a fraud override", () => {
    const text = describeDecision({
      outcome: "released",
      product: "payment_transfer",
      event_type: "payment_transfer",
      amount: 3_500_000,
      currency: "RWF",
      decided_by_rule_id: "FRD-SCORE-RET",
      required_role: "fraud_analyst",
      approver_name: "Aline Uwase",
      approver_role: "fraud_analyst",
      approved_at: "2026-11-15T18:21:00.000Z",
      approval_reason: "Customer confirmed the transfer",
      fraud_block_override: true,
    });
    expect(text).toMatch(/Fraud override by Aline Uwase · Fraud Analyst/);
    expect(text).toMatch(/FRD-SCORE-RET · Retail fraud score hard stop/);
    expect(text).not.toMatch(/Approved by/);
    expect(decidedByLine({
      outcome: "released",
      decided_by_rule_id: "pol_pack_demo_banking_3b9f7043_FRD-SCORE-RET",
      approver_name: "Aline Uwase",
      approver_role: "fraud_analyst",
      fraud_block_override: true,
    })).toBe("Decided by Aline Uwase · Fraud Analyst (fraud override)");
  });

  it("record-only line does not invent a decision", () => {
    expect(
      decidedByLine({
        outcome: "allow",
        mode: "record_only",
        decided_by_rule_id: "LN-07",
        would_have: "hold",
      }),
    ).toBe(RECORD_ONLY_DECISION_LINE);
    expect(
      decidedByLine({
        outcome: "allow",
        decided_by_rule_id: "AUTH-RL-1",
      }),
    ).toBe("Decided by AUTH-RL-1 · Within officer limit");
  });

  it("never says allowed automatically when a human approver is present (A4)", () => {
    const text = describeDecision({
      outcome: "allow",
      product: "retail_loan",
      amount: 18_000_000,
      currency: "RWF",
      decided_by_rule_id: "LN-07",
      required_role_label: "Credit Manager",
      approver_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_at: "2026-11-15T18:21:00.000Z",
      approval_reason: "Within manager band",
    });
    expect(text).not.toMatch(/allowed automatically/i);
    expect(text).toMatch(/Approved by Jean Mutabazi/);
    expect(text).not.toMatch(/governed\.action/);
    expect(text).not.toMatch(/policy_decision/);
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
    expect(formatRuleLabel("pol_pack_demo_banking_3b9f7043_AUTH-RL-1")).toBe(
      "AUTH-RL-1 · Within officer limit",
    );
    expect(formatRuleLabel("pol_pack_demo_banking_3b9f7043_AUTH-RL-2")).toBe(
      "AUTH-RL-2 · Above officer limit",
    );
  });

  it("resolves titles by rule id, never by effect", () => {
    expect(formatRuleLabel("AUTH-RL-1", "hold")).toBe("AUTH-RL-1 · Within officer limit");
    expect(formatRuleLabel("AUTH-RL-2", "allow")).toBe("AUTH-RL-2 · Above officer limit");
    expect(formatRuleLabel("AUTH-RL-2", "hold")).toBe("AUTH-RL-2 · Above officer limit");
  });

  it("dedupes AUTH-RL-1 variants", () => {
    expect(
      dedupeRuleLabels(
        ["AUTH-RL-1", "pol_pack_demo_banking_3b9f7043_AUTH-RL-1"],
        "allow",
      ),
    ).toEqual(["AUTH-RL-1 · Within officer limit"]);
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
        { rule_id: "AUTH-RL-1", decision: "allow" },
        { rule_id: "LN-07", decision: "allow_with_obligation" },
      ],
      decision_basis: { decided_by_rule_id: "LN-07" } as never,
      required_role_label: "Credit Manager",
    });
    expect(text).toMatch(/because rule LN-07/);
    expect(text).not.toMatch(/because rule AUTH-RL-1 · Within/);
  });
});

describe("declined and approver wording", () => {
  it("reads 'declined by Name · Role on date, reason: ...'", () => {
    const text = describeDecision({
      outcome: "declined",
      product: "retail_loan",
      amount: 25_000_000,
      currency: "RWF",
      decided_by_rule_id: "AUTH-RL-2",
      required_role_label: "Credit Manager",
      approver_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_at: "2026-11-15T10:05:00.000Z",
      approval_reason: "Collateral not verified",
    });
    expect(text).toMatch(
      /declined by Jean Mutabazi · Credit Manager on 15 Nov 2026 at 10:05 UTC, reason: Collateral not verified/,
    );
    expect(text).toMatch(/held because rule AUTH-RL-2 · Above officer limit requires a Credit Manager/);
  });

  it("does not double the full stop when the reason already ends with one", () => {
    const text = describeDecision({
      outcome: "released",
      product: "retail_loan",
      amount: 15_000_000,
      currency: "RWF",
      decided_by_rule_id: "AUTH-RL-2",
      required_role_label: "Credit Manager",
      approver_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_at: "2026-11-17T21:01:00.000Z",
      approval_reason: "Cash-flow forecast reviewed.",
    });
    expect(text).toMatch(/with the reason: Cash-flow forecast reviewed\.$/);
    expect(text).not.toMatch(/reviewed\.\./);
  });

  it("formats approvers as 'Name · Role' and never leaks an email", () => {
    expect(formatApprover("Jean Mutabazi", "credit_manager")).toBe("Jean Mutabazi · Credit Manager");
    expect(formatApprover("Aimee Nyirahabimana", null)).toBe("Aimee Nyirahabimana");
    expect(formatApprover(null, "credit_manager")).toBeNull();
  });
});
