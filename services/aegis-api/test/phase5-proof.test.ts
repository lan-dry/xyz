import { describe, expect, it } from "vitest";
import {
  buildBnrLocalControlMapping,
  buildControlMappingArtifacts,
  buildEuAiActControlMapping,
  buildNistAiRmfControlMapping,
  buildSoc2ControlMapping,
} from "../src/compliance/control-mapping.js";
import type { ExportContext } from "../src/compliance/gather-context.js";
import { matchScoreBand, type ScoreBandRow } from "../src/repo/score-bands.js";

const emptyContext: ExportContext = {
  policies: [{ status: "active", name: "Default" }],
  approvals: [],
  auditLog: [{ action: "membership.role_changed" }],
  witnessRoots: [{ root_id: "root_1" }],
  inclusionProofs: [{ proof_id: "prf_1" }],
  publicKeys: [],
};

const defaultBands: ScoreBandRow[] = [
  {
    band_id: "band_low",
    organization_id: "org",
    environment: "production",
    name: "Low",
    min_score: 0,
    max_score: 39,
    decision: "allow",
    require_four_eyes: false,
    sort_order: 1,
  },
  {
    band_id: "band_elevated",
    organization_id: "org",
    environment: "production",
    name: "Elevated",
    min_score: 40,
    max_score: 79,
    decision: "allow_with_obligation",
    require_four_eyes: false,
    sort_order: 2,
  },
  {
    band_id: "band_critical",
    organization_id: "org",
    environment: "production",
    name: "Critical",
    min_score: 80,
    max_score: 100,
    decision: "deny",
    require_four_eyes: true,
    sort_order: 3,
  },
];

describe("Phase 5 proof — score bands + frameworks", () => {
  it("maps fraud score 72 → Elevated → Ask a person", () => {
    const band = matchScoreBand(defaultBands, 72);
    expect(band?.name).toBe("Elevated");
    expect(band?.decision).toBe("allow_with_obligation");
  });

  it("maps score 90 → Critical with four-eyes", () => {
    const band = matchScoreBand(defaultBands, 90);
    expect(band?.name).toBe("Critical");
    expect(band?.decision).toBe("deny");
    expect(band?.require_four_eyes).toBe(true);
  });

  it("exports SOC 2, EU AI Act, NIST AI RMF, and BNR local packs", () => {
    const periodStart = new Date("2026-01-01T00:00:00.000Z");
    const periodEnd = new Date("2026-03-31T23:59:59.999Z");
    const base = {
      periodStart,
      periodEnd,
      eventStats: {
        total: 12,
        allow: 8,
        deny: 2,
        obligation: 2,
        unique_agents: 2,
        unique_traces: 5,
      },
      context: emptyContext,
    };

    expect(buildSoc2ControlMapping(base).framework).toBe("soc2");
    expect(buildEuAiActControlMapping(base).framework).toBe("eu_ai_act");
    expect(buildNistAiRmfControlMapping(base).framework).toBe("nist_ai_rmf");
    expect(buildBnrLocalControlMapping(base).framework).toBe("bnr_local");

    // Evidence pack (combined) must not ship draft framework maps.
    expect(
      buildControlMappingArtifacts("combined", {
        organizationId: "11111111-1111-4111-8111-111111111111",
        ...base,
      }),
    ).toEqual([]);

    const soc2Names = buildControlMappingArtifacts("soc2", {
      organizationId: "11111111-1111-4111-8111-111111111111",
      ...base,
    }).map((a) => a.name);
    expect(soc2Names).toContain("control-mapping-soc2.json");
  });
});
