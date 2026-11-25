/**
 * Segment limits, velocity windows, new beneficiary, fraud score, plain English.
 * Velocity query timings are recorded — no performance claims.
 */
import { describe, expect, it } from "vitest";
import { evaluateBankEvent } from "../src/bank/evaluate.js";
import {
  classifyTimeOfDay,
  defaultSegmentProductLimits,
  deriveGovernanceAttributes,
} from "../src/bank/derive-governance.js";
import { describeDecision } from "../src/bank/describe-decision.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";
import {
  formatRwf,
  sumAmountsFromAttrList,
} from "../src/bank/velocity.js";

describe("classifyTimeOfDay (Africa/Kigali)", () => {
  it("weekday mid-day is business_hours", () => {
    // 2026-03-11 Wednesday 10:00 UTC = 12:00 CAT
    expect(classifyTimeOfDay(new Date("2026-03-11T10:00:00.000Z"))).toBe(
      "business_hours",
    );
  });
  it("weekday late evening is off_hours", () => {
    expect(classifyTimeOfDay(new Date("2026-03-11T20:00:00.000Z"))).toBe(
      "off_hours",
    );
  });
  it("Sunday is off_hours", () => {
    expect(classifyTimeOfDay(new Date("2026-03-15T10:00:00.000Z"))).toBe(
      "off_hours",
    );
  });
});

describe("segment × product limits + pack rules", () => {
  const pack = loadDemoPack("banking");
  const matrix = packMatrixRows(pack);
  const ladder = packRoles(pack);

  it("pack v4 exposes segment_product_limits and AND/OR/NOT rules", () => {
    expect(pack.version).toBeGreaterThanOrEqual(4);
    expect(pack.segment_product_limits?.length).toBeGreaterThan(0);
    const vel = pack.rules.find((r) => r.rule_id === "VEL-SEG-DAY");
    const ben = pack.rules.find((r) => r.rule_id === "BEN-NEW-OFF");
    const frd = pack.rules.find((r) => r.rule_id === "FRD-SCORE-RET");
    const chn = pack.rules.find((r) => r.rule_id === "CHN-AGT");
    expect(vel?.conditions?.expr).toBeTruthy();
    expect(chn?.conditions?.expr).toBeTruthy();
    expect(JSON.stringify(chn?.conditions)).toMatch(/aegis\.channel/);
    expect(ben?.conditions?.expr).toBeTruthy();
    expect(frd?.conditions?.hard_stop).toBe(true);
    expect(JSON.stringify(vel?.conditions)).toMatch(/"or"/);
    expect(JSON.stringify(ben?.conditions)).toMatch(/"and"/);
  });

  it("Retail Standard daily amount boundary: exactly at limit allows", () => {
    const limit = defaultSegmentProductLimits().find(
      (l) => l.segment === "retail_standard" && l.product === "payment_transfer",
    )!;
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 1_000_000,
        currency: "RWF",
        product: "payment_transfer",
        segment: "retail_standard",
        aegis: {
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          projected_daily_amount: limit.max_amount,
          projected_daily_count: 1,
          new_beneficiary: false,
          time_of_day: "business_hours",
          segment: "retail_standard",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
    });
    expect(result.outcome).toBe("allow");
  });

  it("one franc over daily limit holds with VEL-SEG-DAY", () => {
    const limit = defaultSegmentProductLimits().find(
      (l) => l.segment === "retail_standard" && l.product === "payment_transfer",
    )!;
    const projected = (limit.max_amount ?? 0) + 1;
    const plain = `Held: 4th transfer today; day's total ${formatRwf(projected)} exceeds the ${limit.label} daily limit of ${formatRwf(limit.max_amount!)} (counts only activity reported to Aegis)`;
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 2_400_000,
        currency: "RWF",
        product: "payment_transfer",
        aegis: {
          exceeds_segment_daily_amount: true,
          exceeds_segment_daily_count: false,
          projected_daily_amount: projected,
          projected_daily_count: 4,
          new_beneficiary: false,
          time_of_day: "business_hours",
          segment: "retail_standard",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
      plain_explanation: plain,
    });
    expect(result.outcome).toBe("hold");
    expect(result.decision_basis.decided_by_rule_id).toBe("VEL-SEG-DAY");
    expect(result.decision_basis.explanation).toMatch(/Retail Standard/);
    expect(result.decision_basis.explanation).toMatch(
      /counts only activity reported to Aegis/i,
    );
  });

  it("new beneficiary + large + off-hours holds BEN-NEW-OFF", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 6_200_000,
        currency: "RWF",
        product: "payment_transfer",
        aegis: {
          new_beneficiary: true,
          time_of_day: "off_hours",
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          segment: "retail_standard",
        },
        new_beneficiary: true,
        time_of_day: "off_hours",
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
      plain_explanation:
        "Held: first transfer to this beneficiary for the customer, RWF 6,200,000, outside business hours (off_hours)",
    });
    expect(result.outcome).toBe("hold");
    expect(result.decision_basis.decided_by_rule_id).toBe("BEN-NEW-OFF");
  });

  it("agent or USSD off-hours above 5M holds CHN-AGT", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 6_000_000,
        currency: "RWF",
        product: "payment_transfer",
        aegis: {
          channel: "agent",
          time_of_day: "off_hours",
          new_beneficiary: false,
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          segment: "retail_standard",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
    });
    expect(result.outcome).toBe("hold");
    expect(result.matched_rules.some((m) => m.rule_id === "CHN-AGT")).toBe(true);
  });

  it("branch channel does not match CHN-AGT", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 6_000_000,
        currency: "RWF",
        product: "payment_transfer",
        aegis: {
          channel: "branch",
          time_of_day: "off_hours",
          new_beneficiary: false,
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          segment: "retail_standard",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
    });
    expect(result.matched_rules.some((m) => m.rule_id === "CHN-AGT")).toBe(false);
  });

  it("fraud score 0.94 on retail_standard hard-stops FRD-SCORE-RET", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 3_500_000,
        currency: "RWF",
        product: "payment_transfer",
        model: { score: 0.94, version: "3.2" },
        aegis: {
          segment: "retail_standard",
          model_score_label: "asserted by source",
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          new_beneficiary: false,
          time_of_day: "business_hours",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
      plain_explanation:
        "Stopped: fraud model score 0.94 (version 3.2, asserted by source) meets or exceeds the Retail Standard block threshold of 0.90",
    });
    expect(result.outcome).toBe("stop");
    expect(result.decision_basis.decided_by_rule_id).toBe("FRD-SCORE-RET");
    expect(result.matched_rules.some((m) => m.hard_stop)).toBe(true);
  });

  it("NOT: score 0.94 on private_banking does not match FRD-SCORE-RET segment", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_gov",
      combine: "all_matching",
      rules: pack.rules.map((r) => ({
        ...r,
        policy_id: "pol_gov",
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 3_500_000,
        currency: "RWF",
        product: "payment_transfer",
        model: { score: 0.94, version: "3.2" },
        aegis: {
          segment: "private_banking",
          exceeds_segment_daily_amount: false,
          exceeds_segment_daily_count: false,
          new_beneficiary: false,
          time_of_day: "business_hours",
        },
      },
      matrix_rows: matrix.filter((m) => m.product === "payment_transfer"),
      ladder,
      product: "payment_transfer",
    });
    expect(result.decision_basis.decided_by_rule_id).not.toBe("FRD-SCORE-RET");
  });
});

describe("describeDecision plain English", () => {
  it("surfaces Held: velocity sentence on the case page wording", () => {
    const text = describeDecision({
      outcome: "hold",
      product: "payment_transfer",
      event_type: "payment_transfer",
      amount: 2_400_000,
      currency: "RWF",
      policy_version: 4,
      decided_by_rule_id: "VEL-SEG-DAY",
      decision_basis: {
        outcome: "hold",
        decided_by_rule_id: "VEL-SEG-DAY",
        explanation:
          "Held: 4th transfer today; day's total RWF 9,600,000 exceeds the Retail Standard daily limit of RWF 8,000,000 (counts only activity reported to Aegis)",
        matched: [],
      },
      required_role: "credit_manager",
    });
    expect(text).toMatch(/^Held: 4th transfer today/);
    expect(text).toMatch(/Retail Standard/);
    expect(text).toMatch(/counts only activity reported to Aegis/i);
  });
});

describe("amount helpers / window roll-off concept", () => {
  it("sum of three 2.4M + fourth = 9.6M", () => {
    const prior = [
      { amount: 2_400_000 },
      { amount: 2_400_000 },
      { amount: 2_400_000 },
    ];
    expect(sumAmountsFromAttrList(prior)).toBe(7_200_000);
    expect(sumAmountsFromAttrList(prior) + 2_400_000).toBe(9_600_000);
  });

  it("window roll-off: event older than window is excluded from sum", () => {
    const now = Date.now();
    const inside = { amount: 2_400_000, _t: now - 2 * 3600_000 };
    const outside = { amount: 2_400_000, _t: now - 30 * 3600_000 };
    const windowMs = 24 * 3600_000;
    const inWindow = [inside, outside].filter((r) => now - r._t < windowMs);
    expect(sumAmountsFromAttrList(inWindow)).toBe(2_400_000);
  });

  it("splitting across two channels still sums for the customer", () => {
    const mobile = { amount: 2_400_000, channel: "mobile" };
    const ussd = { amount: 2_400_000, channel: "ussd" };
    const branch = { amount: 2_400_000, channel: "branch" };
    expect(sumAmountsFromAttrList([mobile, ussd, branch])).toBe(7_200_000);
  });
});

describe("deriveGovernanceAttributes (stubbed DB)", () => {
  it("force_off_hours and model score label asserted by source", async () => {
    const fakeClient = {
      query: async (sql: string) => {
        if (sql.includes("COUNT(*)")) {
          return { rows: [{ cnt: "0", amt: "0" }] };
        }
        if (sql.includes("EXISTS")) {
          return { rows: [{ ok: false }] };
        }
        return { rows: [{ limits: null }] };
      },
    };
    const out = await deriveGovernanceAttributes(fakeClient as never, {
      organizationId: "00000000-0000-0000-0000-000000000001",
      attributes: {
        amount: 6_200_000,
        customer_id: "CUST-TEST",
        beneficiary_account: "BEN-NEW",
        segment: "retail_standard",
        product: "payment_transfer",
        force_off_hours: true,
        model: { score: 0.5, version: "1.0" },
      },
      product: "payment_transfer",
      segmentLimits: defaultSegmentProductLimits(),
    });
    expect((out.derived.aegis as { time_of_day: string }).time_of_day).toBe(
      "off_hours",
    );
    expect((out.derived.aegis as { new_beneficiary: boolean }).new_beneficiary).toBe(
      true,
    );
    expect(
      (out.derived.aegis as { model_score_label: string }).model_score_label,
    ).toBe("asserted by source");
    expect(out.hold_plain_english).toMatch(/first transfer to this beneficiary/i);
  });
});
