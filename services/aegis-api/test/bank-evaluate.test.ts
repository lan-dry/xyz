import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETAIL_LOAN_LADDER,
  DEFAULT_RETAIL_LOAN_MATRIX,
  type AuthorityMatrixRow,
} from "../src/bank/authority-matrix.js";
import { evaluateBankEvent } from "../src/bank/evaluate.js";
import { toBankOutcome, isHumanApprovalObligation } from "../src/bank/outcome.js";
import { parseBankEvent, BankValidationError } from "../src/bank/validate.js";
import { policyContentHash } from "../src/bank/policy-hash.js";

describe("bank outcome mapping (D2)", () => {
  it("maps allow_with_obligation to hold only for human approval", () => {
    expect(toBankOutcome("allow_with_obligation")).toBe("hold");
    expect(
      toBankOutcome("allow_with_obligation", { kind: "human_approval" }),
    ).toBe("hold");
    expect(
      toBankOutcome("allow_with_obligation", { kind: "callback_verify" }),
    ).toBe("allow");
    expect(isHumanApprovalObligation({ kind: "other" })).toBe(false);
    expect(toBankOutcome("deny")).toBe("stop");
    expect(toBankOutcome("allow")).toBe("allow");
  });
});

describe("bank event validation", () => {
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

  it("accepts a minimal valid loan event", () => {
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

describe("evaluateBankEvent", () => {
  const matrix: AuthorityMatrixRow[] = DEFAULT_RETAIL_LOAN_MATRIX.map(
    (r, i) => ({ ...r, matrix_id: `m${i}` }),
  );

  it("scenario 1 shape: allow under AUTH-RL for 3M", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "AUTH-RL",
          tool_pattern: "bank.loan.decide",
          decision: "allow",
          priority: 10,
        },
      ],
      tool_name: "bank.loan.decide",
      attributes: { amount: 3_000_000, currency: "RWF", product: "retail_loan" },
      matrix_rows: matrix,
      ladder: DEFAULT_RETAIL_LOAN_LADDER,
      product: "retail_loan",
    });
    expect(result.outcome).toBe("allow");
    expect(result.matched_rules.some((m) => m.rule_id === "AUTH-RL")).toBe(
      true,
    );
  });

  it("record-only: would have held but outcome allow", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_v3",
      combine: "all_matching",
      rules: [
        {
          rule_id: "LN-07",
          tool_pattern: "bank.loan.decide",
          decision: "allow_with_obligation",
          priority: 50,
          obligations: { kind: "human_approval", required_role: "credit_manager" },
        },
      ],
      tool_name: "bank.loan.decide",
      attributes: { amount: 18_000_000, currency: "RWF" },
      matrix_rows: matrix,
      ladder: DEFAULT_RETAIL_LOAN_LADDER,
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
      tool_name: "bank.loan.decide",
      attributes: { amount: 18_000_000, currency: "RWF" },
      matrix_rows: matrix,
      ladder: DEFAULT_RETAIL_LOAN_LADDER,
      product: "retail_loan",
      record_only: false,
    });
    expect(result.mode).toBe("enforce");
    expect(result.outcome).toBe("hold");
    expect(result.required_roles).toContain("credit_manager");
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
          tool_pattern: "bank.loan.decide",
          decision: "allow",
          priority: 10,
        },
      ],
    };
    expect(policyContentHash(input)).toBe(policyContentHash(input));
    expect(policyContentHash(input)).toHaveLength(64);
  });
});
