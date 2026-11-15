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
      toBankOutcome("allow_with_obligation", { kind: "callback_verify" }),
    ).toBe("allow");
    expect(isHumanApprovalObligation({ kind: "other" })).toBe(false);
    expect(toBankOutcome("deny")).toBe("stop");
    expect(toBankOutcome("allow")).toBe("allow");
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
          rule_id: "AUTH-RL",
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
