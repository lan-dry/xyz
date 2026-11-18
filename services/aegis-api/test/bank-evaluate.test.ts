import { describe, expect, it } from "vitest";
import { evaluateBankEvent } from "../src/bank/evaluate.js";
import { toBankOutcome, isHumanApprovalObligation } from "../src/bank/outcome.js";
import { parseBankEvent, BankValidationError } from "../src/bank/validate.js";
import { policyContentHash } from "../src/bank/policy-hash.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";

describe("outcome mapping (D2)", () => {
  it("maps allow_with_obligation to hold only for human approval", () => {
    expect(toBankOutcome("allow_with_obligation")).toBe("hold");
    expect(
      toBankOutcome("allow_with_obligation", { kind: "human_approval" }),
    ).toBe("hold");
    expect(
      toBankOutcome("allow_with_obligation", { type: "require_approval" }),
    ).toBe("hold");
    expect(
      toBankOutcome("allow_with_obligation", { kind: "callback_verify" }),
    ).toBe("allow");
    expect(isHumanApprovalObligation({ kind: "other" })).toBe(false);
    expect(toBankOutcome("deny")).toBe("stop");
    expect(toBankOutcome("allow")).toBe("allow");
  });
});

describe("F2 matched_rules vs outcome (decision_basis)", () => {
  const pack = loadDemoPack("banking");
  const matrix = packMatrixRows(pack);
  const ladder = packRoles(pack);
  const currency = pack.currencies[0]!;

  it("amount_gte rule below threshold does not match; outcome allow under AUTH-RL-1", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "r_v4_demo",
          tool_pattern: "governed.action",
          decision: "allow_with_obligation",
          priority: 200,
          conditions: {
            amount_gte: 15_000_000,
            obligations: [{ type: "require_approval", roles: ["credit_manager"] }],
          },
          obligations: [{ type: "require_approval", roles: ["credit_manager"] }],
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 1_200_000, currency, product: "retail_loan" },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("allow");
    expect(result.matched_rules.map((m) => m.rule_id)).not.toContain("r_v4_demo");
    expect(result.matched_rules.some((m) => m.rule_id === "AUTH-RL-1")).toBe(true);
    expect(result.decision_basis.explanation).toMatch(/Allowed|No human approval/i);
  });

  it("amount_gte rule at threshold holds with require_approval (human)", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v4",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "r_v4_demo",
          tool_pattern: "governed.action",
          decision: "allow_with_obligation",
          priority: 200,
          conditions: {
            amount_gte: 15_000_000,
            obligations: [{ type: "require_approval", roles: ["credit_manager"] }],
          },
          obligations: [{ type: "require_approval", roles: ["credit_manager"] }],
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 18_000_000, currency, product: "retail_loan" },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("hold");
    expect(result.matched_rules.some((m) => m.rule_id === "r_v4_demo")).toBe(true);
    expect(result.decision_basis.explanation).toMatch(/Held|human approval|r_v4/i);
  });

  it("non-human obligation matched with allow outcome is explained (D2)", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "r_callback",
          tool_pattern: "governed.action",
          decision: "allow_with_obligation",
          priority: 50,
          obligations: { kind: "callback_verify" },
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 1_200_000, currency, product: "retail_loan" },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("allow");
    expect(result.matched_rules.some((m) => m.rule_id === "r_callback")).toBe(true);
    expect(result.decision_basis.explanation).toMatch(/non-human obligation|do not become a hold/i);
  });
});

describe("event validation", () => {
  it("returns machine-readable 400 body for malformed events", () => {
    try {
      parseBankEvent({ schema_version: 2 });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BankValidationError);
      const err = e as BankValidationError;
      expect(err.status).toBe(400);
      expect(err.body.error).toBe("validation_error");
      expect(err.body.code).toBe("malformed_bank_event");
      expect(err.body.fields?.length).toBeGreaterThan(0);
    }
  });

  it("accepts a minimal valid event", () => {
    const event = parseBankEvent({
      schema_version: 1,
      case_id: "case-1",
      idempotency_key: "idem-1",
      event_type: "loan_decision",
      product: "retail_loan",
      emitted_at: "2026-01-15T10:00:00.000Z",
      attributes: { amount: 3_000_000, currency: "RWF" },
    });
    expect(event.case_id).toBe("case-1");
  });
});

describe("evaluateBankEvent with pack config", () => {
  const pack = loadDemoPack("banking");
  const matrix = packMatrixRows(pack);
  const ladder = packRoles(pack);
  const currency = pack.currencies[0]!;

  it("allow under configured low band", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 3_000_000, currency, product: "retail_loan" },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("allow");
    expect(result.matched_rules.some((m) => m.rule_id === "AUTH-RL-1")).toBe(
      true,
    );
  });

  it("lists only SANC-01 for the RWF 2,500,000 PEP stop (not the default allow)", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "SANC-01",
          tool_pattern: "governed.action",
          decision: "deny",
          priority: 100,
          conditions: {
            hard_stop: true,
            expr: {
              or: [
                { eq: ["screening.sanctions_hit", true] },
                { eq: ["screening.pep_hit", true] },
              ],
            },
          },
        },
      ],
      tool_name: "governed.action",
      attributes: {
        amount: 2_500_000,
        currency,
        product: "retail_loan",
        screening: { sanctions_hit: false, pep_hit: true },
      },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("stop");
    expect(result.matched_rules.map((m) => m.rule_id)).toEqual(["SANC-01"]);
    expect(result.decision_basis.decided_by_rule_id).toBe("SANC-01");
  });

  it("lists only PAY-03 for the RWF 4,800,000 unverified payment (not AUTH-RL-1)", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "PAY-03",
          tool_pattern: "governed.action",
          decision: "allow_with_obligation",
          priority: 60,
          conditions: {
            expr: { eq: ["payment.callback_verified", false] },
          },
          obligations: {
            kind: "human_approval",
            required_role: "credit_manager",
          },
        },
      ],
      tool_name: "governed.action",
      attributes: {
        amount: 4_800_000,
        currency,
        product: "retail_loan",
        payment: { callback_verified: false },
      },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("hold");
    expect(result.matched_rules.map((m) => m.rule_id)).toEqual(["PAY-03"]);
    expect(result.decision_basis.decided_by_rule_id).toBe("PAY-03");
  });

  it("mid-band hold is AUTH-RL-2 only", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL-1",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 15_000_000, currency, product: "retail_loan" },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("hold");
    expect(result.matched_rules.map((m) => m.rule_id)).toEqual(["AUTH-RL-2"]);
    expect(result.decision_basis.decided_by_rule_id).toBe("AUTH-RL-2");
  });

  it("record-only: would have held but outcome allow", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "LN-07",
          tool_pattern: "governed.action",
          decision: "allow_with_obligation",
          priority: 50,
          obligations: {
            kind: "human_approval",
            required_role: "credit_manager",
          },
        },
      ],
      tool_name: "governed.action",
      attributes: { amount: 18_000_000, currency },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
      record_only: true,
    });
    expect(result.mode).toBe("record_only");
    expect(result.outcome).toBe("allow");
    expect(result.would_have).toBe("hold");
  });

  it("record-only defaults off: enforce holds", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [],
      tool_name: "governed.action",
      attributes: { amount: 18_000_000, currency },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
      record_only: false,
    });
    expect(result.mode).toBe("enforce");
    expect(result.outcome).toBe("hold");
    expect(result.required_roles).toContain("credit_manager");
  });

  it("does not apply matrix without currency on the event", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [],
      tool_name: "governed.action",
      attributes: { amount: 18_000_000 },
      matrix_rows: matrix,
      ladder,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("allow");
    expect(result.matrix).toBeNull();
  });
});

describe("policy content hash", () => {
  it("is stable for same content", () => {
    const input = {
      policy_id: "pol_1",
      name: "Retail loan",
      version: 3,
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL",
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
        },
      ],
    };
    expect(policyContentHash(input)).toBe(policyContentHash(input));
    expect(policyContentHash(input)).toHaveLength(64);
  });
});
