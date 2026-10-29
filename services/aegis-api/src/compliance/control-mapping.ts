import type { ExportContext } from "./gather-context.js";
import type { EventPeriodStats } from "./event-stats.js";
import {
  computeApprovalStats,
  countActivePolicies,
} from "./event-stats.js";

export type ControlStatus = "pass" | "partial" | "fail" | "not_applicable";

export type ControlAssessment = {
  id: string;
  name: string;
  status: ControlStatus;
  metrics: Record<string, number | string | boolean>;
  evidence_files: string[];
  notes?: string;
};

export type ControlMappingDocument = {
  version: string;
  framework: "soc2" | "eu_ai_act" | "nist_ai_rmf" | "bnr_local";
  period_start: string;
  period_end: string;
  generated_at: string;
  overall_status: ControlStatus;
  controls: ControlAssessment[];
};

export type Soc2Type1Report = {
  version: string;
  report_type: "soc2_readiness_summary";
  organization_id: string;
  organization_name: string | null;
  period_start: string;
  period_end: string;
  generated_at: string;
  overall_status: ControlStatus;
  summary: string;
  /** Readiness only — not a CPA SOC 2 Type I / Type II attestation. */
  disclaimer: string;
  control_summary: {
    evidence_found: number;
    evidence_partial: number;
    evidence_missing: number;
  };
  recommendations: string[];
  artifacts: string[];
};

function overallFromControls(controls: ControlAssessment[]): ControlStatus {
  if (controls.some((c) => c.status === "fail")) return "fail";
  if (controls.some((c) => c.status === "partial")) return "partial";
  if (controls.every((c) => c.status === "not_applicable")) return "not_applicable";
  return "pass";
}

function summarizeControls(controls: ControlAssessment[]) {
  return {
    pass: controls.filter((c) => c.status === "pass").length,
    partial: controls.filter((c) => c.status === "partial").length,
    fail: controls.filter((c) => c.status === "fail").length,
  };
}

export function buildSoc2ControlMapping(input: {
  periodStart: Date;
  periodEnd: Date;
  eventStats: EventPeriodStats;
  context: ExportContext;
}): ControlMappingDocument {
  const activePolicies = countActivePolicies(input.context);
  const approvals = computeApprovalStats(input.context);
  const generatedAt = new Date().toISOString();

  const controls: ControlAssessment[] = [
    {
      id: "CC6.1",
      name: "Logical access: agent actions logged with policy decision",
      status:
        input.eventStats.total > 0 && activePolicies > 0
          ? "pass"
          : input.eventStats.total > 0
            ? "partial"
            : "fail",
      metrics: {
        events_logged: input.eventStats.total,
        deny_decisions: input.eventStats.deny,
        active_policies: activePolicies,
        unique_agents: input.eventStats.unique_agents,
      },
      evidence_files: ["events.ndjson", "policies.json"],
      notes:
        input.eventStats.total === 0
          ? "No agent events in period. Ingest signed events before audit."
          : undefined,
    },
    {
      id: "CC6.6",
      name: "Human approval for high-risk obligations",
      status:
        input.eventStats.obligation === 0
          ? "not_applicable"
          : approvals.approved + approvals.rejected >= input.eventStats.obligation
            ? "pass"
            : approvals.total > 0
              ? "partial"
              : "fail",
      metrics: {
        obligation_events: input.eventStats.obligation,
        approvals_recorded: approvals.total,
        approved: approvals.approved,
        rejected: approvals.rejected,
        pending: approvals.pending,
      },
      evidence_files: ["approvals.ndjson", "events.ndjson"],
    },
    {
      id: "CC7.2",
      name: "Monitoring: tamper-evident export with witness proofs",
      status:
        input.context.witnessRoots.length > 0 &&
        input.context.inclusionProofs.length > 0
          ? "pass"
          : input.context.witnessRoots.length > 0
            ? "partial"
            : input.eventStats.total > 0
              ? "partial"
              : "fail",
      metrics: {
        witness_roots: input.context.witnessRoots.length,
        inclusion_proofs: input.context.inclusionProofs.length,
        audit_log_entries: input.context.auditLog.length,
      },
      evidence_files: [
        "witness-roots.json",
        "inclusion-proofs.ndjson",
        "audit-log.ndjson",
        "manifest.json",
      ],
    },
    {
      id: "CC8.1",
      name: "Change management: console actions audited",
      status:
        input.context.auditLog.length > 0
          ? "pass"
          : input.eventStats.total > 0
            ? "partial"
            : "not_applicable",
      metrics: {
        audit_log_entries: input.context.auditLog.length,
      },
      evidence_files: ["audit-log.ndjson"],
      notes:
        input.context.auditLog.length === 0
          ? "No console audit entries in period (invites, keys, role changes)."
          : undefined,
    },
  ];

  return {
    version: "2026-05-p2",
    framework: "soc2",
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: generatedAt,
    overall_status: overallFromControls(controls),
    controls,
  };
}

export function buildEuAiActControlMapping(input: {
  periodStart: Date;
  periodEnd: Date;
  eventStats: EventPeriodStats;
  context: ExportContext;
}): ControlMappingDocument {
  const activePolicies = countActivePolicies(input.context);
  const generatedAt = new Date().toISOString();

  const controls: ControlAssessment[] = [
    {
      id: "Art.12.1",
      name: "Automatic logging of each agent action",
      status:
        input.eventStats.total > 0 && input.eventStats.unique_traces > 0
          ? "pass"
          : input.eventStats.total > 0
            ? "partial"
            : "fail",
      metrics: {
        events_logged: input.eventStats.total,
        unique_traces: input.eventStats.unique_traces,
        unique_agents: input.eventStats.unique_agents,
      },
      evidence_files: ["events.ndjson"],
    },
    {
      id: "Art.12.3",
      name: "Policy decisions recorded per action",
      status:
        input.eventStats.total > 0 &&
        input.eventStats.deny + input.eventStats.allow + input.eventStats.obligation ===
          input.eventStats.total
          ? activePolicies > 0
            ? "pass"
            : "partial"
          : "fail",
      metrics: {
        policy_decisions_recorded: input.eventStats.total,
        deny_count: input.eventStats.deny,
        active_policies: activePolicies,
      },
      evidence_files: ["events.ndjson", "policies.json"],
    },
    {
      id: "Art.12.4",
      name: "Integrity and third-party verifiability",
      status:
        input.context.inclusionProofs.length > 0
          ? "pass"
          : input.context.witnessRoots.length > 0
            ? "partial"
            : "fail",
      metrics: {
        witness_roots: input.context.witnessRoots.length,
        inclusion_proofs: input.context.inclusionProofs.length,
      },
      evidence_files: [
        "witness-roots.json",
        "inclusion-proofs.ndjson",
        "manifest.json",
      ],
    },
  ];

  return {
    version: "2026-05-p2",
    framework: "eu_ai_act",
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: generatedAt,
    overall_status: overallFromControls(controls),
    controls,
  };
}

export function buildSoc2Type1Report(input: {
  organizationId: string;
  organizationName?: string | null;
  periodStart: Date;
  periodEnd: Date;
  soc2: ControlMappingDocument;
  euAiAct?: ControlMappingDocument;
}): Soc2Type1Report {
  const summaryParts = [
    `Period ${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}.`,
    `SOC 2 control readiness: ${input.soc2.overall_status} (${input.soc2.controls.length} controls assessed).`,
  ];
  if (input.euAiAct) {
    summaryParts.push(
      `EU AI Act Art. 12 readiness: ${input.euAiAct.overall_status}.`,
    );
  }

  const recommendations: string[] = [];
  for (const control of input.soc2.controls) {
    if (control.status === "fail" || control.status === "partial") {
      recommendations.push(`${control.id}: ${control.notes ?? control.name}`);
    }
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Continue monthly scheduled exports and retain ZIP integrity hashes for auditor review.",
    );
  }

  const controlSummary = summarizeControls(input.soc2.controls);

  return {
    version: "2026-10-export",
    report_type: "soc2_readiness_summary",
    organization_id: input.organizationId,
    organization_name: input.organizationName ?? null,
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: new Date().toISOString(),
    overall_status: input.soc2.overall_status,
    summary: summaryParts.join(" "),
    disclaimer:
      "This is an evidence-mapping / readiness summary generated by Salanor Aegis. It is not a SOC 2 Type I or Type II report, not an audit, and not an attestation by an independent CPA firm.",
    control_summary: {
      evidence_found: controlSummary.pass,
      evidence_partial: controlSummary.partial,
      evidence_missing: controlSummary.fail,
    },
    recommendations,
    artifacts: [
      "soc2-readiness-summary.json",
      "control-mapping-soc2.json",
      "control-mapping-eu-ai-act.json",
      "events.ndjson",
      "manifest.json",
    ],
  };
}

/**
 * Framework mapping JSONs are draft / not legally reviewed.
 * Default "combined" evidence pack intentionally excludes them so we do not
 * over-claim EU AI Act / SOC 2 / BNR / NIST status in a customer-facing ZIP.
 * Opt-in only via explicit framework bundle_type (still marked draft in content).
 */
export function buildControlMappingArtifacts(
  bundleType: string,
  input: {
    organizationId: string;
    organizationName?: string | null;
    periodStart: Date;
    periodEnd: Date;
    eventStats: EventPeriodStats;
    context: ExportContext;
  },
): Array<{ name: string; content: unknown }> {
  // Combined = cryptographic evidence pack only (events, policies, approvals, proofs).
  if (bundleType === "combined") {
    return [];
  }

  const artifacts: Array<{ name: string; content: unknown }> = [];
  const base = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eventStats: input.eventStats,
    context: input.context,
  };

  let soc2: ControlMappingDocument | undefined;
  let euAiAct: ControlMappingDocument | undefined;

  if (bundleType === "soc2") {
    soc2 = buildSoc2ControlMapping(base);
    artifacts.push({
      name: "control-mapping-soc2.json",
      content: {
        ...soc2,
        draft: true,
        disclaimer:
          "Draft Salanor readiness mapping. Not a SOC 2 Type I/II report. Control IDs are illustrative until counsel-reviewed.",
      },
    });
  }
  if (bundleType === "eu_ai_act") {
    euAiAct = buildEuAiActControlMapping(base);
    artifacts.push({
      name: "control-mapping-eu-ai-act.json",
      content: {
        ...euAiAct,
        draft: true,
        disclaimer:
          "Draft Salanor mapping. Not legal advice. High-risk Annex III obligations and log-retention rules must be counsel-reviewed before customer use.",
      },
    });
  }
  if (bundleType === "nist_ai_rmf") {
    artifacts.push({
      name: "control-mapping-nist-ai-rmf.json",
      content: {
        ...buildNistAiRmfControlMapping(base),
        draft: true,
        disclaimer:
          "Draft Salanor mapping against NIST AI RMF themes. Names/IDs may not match official function wording until reviewed.",
      },
    });
  }
  if (bundleType === "bnr_local") {
    artifacts.push({
      name: "control-mapping-bnr-local.json",
      content: {
        ...buildBnrLocalControlMapping(base),
        draft: true,
        disclaimer:
          "Draft internal Salanor IDs (e.g. BNR-OPS-*). Not official Banque Nationale du Rwanda requirement numbers. Counsel review required.",
      },
    });
  }
  if (soc2) {
    artifacts.push({
      name: "soc2-readiness-summary.json",
      content: buildSoc2Type1Report({
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        soc2,
        euAiAct,
      }),
    });
  }

  return artifacts;
}

export function buildNistAiRmfControlMapping(input: {
  periodStart: Date;
  periodEnd: Date;
  eventStats: EventPeriodStats;
  context: ExportContext;
}): ControlMappingDocument {
  const generatedAt = new Date().toISOString();
  const controls: ControlAssessment[] = [
    {
      id: "GOVERN-1.1",
      name: "Policies, processes, and procedures across the AI lifecycle",
      status: countActivePolicies(input.context) > 0 ? "pass" : "partial",
      metrics: { active_policies: countActivePolicies(input.context) },
      evidence_files: ["policies.json"],
    },
    {
      id: "MAP-1.1",
      name: "Context established and documented",
      status: input.eventStats.unique_agents > 0 ? "pass" : "fail",
      metrics: { unique_agents: input.eventStats.unique_agents },
      evidence_files: ["events.ndjson"],
    },
    {
      id: "MEASURE-2.3",
      name: "AI system evaluated for trustworthy characteristics",
      status:
        input.context.inclusionProofs.length > 0
          ? "pass"
          : input.eventStats.total > 0
            ? "partial"
            : "fail",
      metrics: { inclusion_proofs: input.context.inclusionProofs.length },
      evidence_files: ["inclusion-proofs.ndjson", "witness-roots.json"],
    },
  ];
  return {
    version: "2026-10-p5",
    framework: "nist_ai_rmf",
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: generatedAt,
    overall_status: overallFromControls(controls),
    controls,
  };
}

/** Local / regional pack example (BNR-oriented operational controls). */
export function buildBnrLocalControlMapping(input: {
  periodStart: Date;
  periodEnd: Date;
  eventStats: EventPeriodStats;
  context: ExportContext;
}): ControlMappingDocument {
  const generatedAt = new Date().toISOString();
  const controls: ControlAssessment[] = [
    {
      id: "BNR-OPS-01",
      name: "Human approval for high-risk payment side effects",
      status:
        input.eventStats.obligation > 0 || input.context.approvals.length > 0
          ? "pass"
          : input.eventStats.total > 0
            ? "partial"
            : "fail",
      metrics: {
        obligations: input.eventStats.obligation,
        approvals: input.context.approvals.length,
      },
      evidence_files: ["approvals.ndjson", "events.ndjson"],
    },
    {
      id: "BNR-OPS-02",
      name: "Tamper-evident audit trail retained for examination",
      status:
        input.context.witnessRoots.length > 0 || input.context.inclusionProofs.length > 0
          ? "pass"
          : "fail",
      metrics: {
        witness_roots: input.context.witnessRoots.length,
        inclusion_proofs: input.context.inclusionProofs.length,
      },
      evidence_files: ["witness-roots.json", "manifest.json"],
    },
  ];
  return {
    version: "2026-10-p5",
    framework: "bnr_local",
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: generatedAt,
    overall_status: overallFromControls(controls),
    controls,
  };
}
