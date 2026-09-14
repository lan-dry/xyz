import { describe, expect, it } from "vitest";
import {
  buildSoc2ControlMapping,
  buildSoc2Type1Report,
} from "../src/compliance/control-mapping.js";
import type { ExportContext } from "../src/compliance/gather-context.js";

const emptyContext: ExportContext = {
  policies: [{ status: "active", name: "Default" }],
  approvals: [],
  auditLog: [{ action: "membership.role_changed" }],
  witnessRoots: [{ root_id: "root_1" }],
  inclusionProofs: [{ proof_id: "prf_1" }],
};

describe("control mapping", () => {
  it("marks CC6.1 pass when events and active policy exist", () => {
    const periodStart = new Date("2026-04-01T00:00:00.000Z");
    const periodEnd = new Date("2026-04-30T23:59:59.999Z");
    const mapping = buildSoc2ControlMapping({
      periodStart,
      periodEnd,
      eventStats: {
        total: 10,
        allow: 8,
        deny: 2,
        obligation: 0,
        unique_agents: 1,
        unique_traces: 3,
      },
      context: emptyContext,
    });

    const cc61 = mapping.controls.find((c) => c.id === "CC6.1");
    expect(cc61?.status).toBe("pass");
    expect(mapping.overall_status).not.toBe("fail");
  });

  it("builds SOC 2 Type I report with recommendations when partial", () => {
    const periodStart = new Date("2026-04-01T00:00:00.000Z");
    const periodEnd = new Date("2026-04-30T23:59:59.999Z");
    const mapping = buildSoc2ControlMapping({
      periodStart,
      periodEnd,
      eventStats: {
        total: 0,
        allow: 0,
        deny: 0,
        obligation: 0,
        unique_agents: 0,
        unique_traces: 0,
      },
      context: {
        ...emptyContext,
        policies: [],
        witnessRoots: [],
        inclusionProofs: [],
      },
    });

    const report = buildSoc2Type1Report({
      organizationId: "11111111-1111-4111-8111-111111111111",
      periodStart,
      periodEnd,
      soc2: mapping,
    });

    expect(report.report_type).toBe("soc2_type1_readiness");
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.overall_status).toBe("fail");
  });
});
