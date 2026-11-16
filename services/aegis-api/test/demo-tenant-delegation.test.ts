import { describe, expect, it } from "vitest";
import { delegationStatus } from "../src/bank/approval-delegate.js";
import { metadataFromObligations } from "../src/bank/approval-context.js";
import { DEMO_TENANT_ESCALATION } from "../src/bank/demo-tenant.js";
import { isEscalationDue } from "../src/bank/escalation.js";
import { resolveExpiry } from "../src/routes/console/delegations.js";

const NOW = new Date("2026-01-01T10:00:00.000Z");

describe("metadataFromObligations", () => {
  it("folds roles, fields and the tightest escalation window", () => {
    const meta = metadataFromObligations(
      [
        { type: "human_approval", required_fields: ["reason_code"], escalate_after_ms: 300_000, escalate_to_role: "head_of_compliance" },
        { type: "human_approval", required_fields: ["comment", "reason_code"], escalate_after_ms: 120_000, escalate_to_role: "head_of_compliance" },
      ],
      ["credit_manager"],
    );
    expect(meta.required_role).toBe("credit_manager");
    expect(meta.required_fields?.sort()).toEqual(["comment", "reason_code"]);
    expect(meta.escalate_after_ms).toBe(120_000);
    expect(meta.escalate_to_role).toBe("head_of_compliance");
  });

  it("returns nothing for an empty hold", () => {
    expect(metadataFromObligations([], [])).toEqual({});
  });

  it("ignores escalation without a target role", () => {
    const meta = metadataFromObligations([{ escalate_after_ms: 1000 }], []);
    expect(meta.escalate_after_ms).toBeUndefined();
  });
});

describe("isEscalationDue", () => {
  const created = new Date(NOW.getTime() - DEMO_TENANT_ESCALATION.afterMs);
  const meta = {
    escalate_after_ms: DEMO_TENANT_ESCALATION.afterMs,
    escalate_to_role: DEMO_TENANT_ESCALATION.toRole,
  };
  it("is due once the configured window of real time has elapsed", () => {
    expect(isEscalationDue(meta, created, NOW)).toBe(true);
    expect(isEscalationDue(meta, new Date(created.getTime() + 1000), NOW)).toBe(false);
  });
  it("fires only once", () => {
    expect(isEscalationDue({ ...meta, escalated_to_role_at: NOW.toISOString() }, created, NOW)).toBe(false);
  });
  it("is off without config", () => {
    expect(isEscalationDue({}, created, NOW)).toBe(false);
    expect(isEscalationDue(null, created, NOW)).toBe(false);
  });
  it("demo tenant window is two minutes", () => {
    expect(DEMO_TENANT_ESCALATION.afterMs).toBe(120_000);
  });
});

describe("resolveExpiry", () => {
  it("accepts a duration", () => {
    const r = resolveExpiry({ duration_minutes: 60 }, NOW);
    expect(r instanceof Date && r.getTime()).toBe(NOW.getTime() + 3_600_000);
  });
  it("rejects past, absurd and missing expiries", () => {
    expect(resolveExpiry({ expires_at: "2025-01-01T00:00:00Z" }, NOW)).toHaveProperty("error");
    expect(resolveExpiry({ duration_minutes: 60 * 24 * 31 }, NOW)).toHaveProperty("error");
    expect(resolveExpiry({}, NOW)).toHaveProperty("error");
    expect(resolveExpiry({ expires_at: "nonsense" }, NOW)).toHaveProperty("error");
  });
});

describe("delegationStatus", () => {
  it("reports active, expired and revoked", () => {
    const future = new Date(NOW.getTime() + 60_000);
    const past = new Date(NOW.getTime() - 60_000);
    expect(delegationStatus({ expires_at: future, revoked_at: null }, NOW)).toBe("active");
    expect(delegationStatus({ expires_at: past, revoked_at: null }, NOW)).toBe("expired");
    expect(delegationStatus({ expires_at: future, revoked_at: past }, NOW)).toBe("revoked");
  });
});
