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
  framework: "soc2" | "eu_ai_act";
  period_start: string;
  period_end: string;
  generated_at: string;
  overall_status: ControlStatus;
  controls: ControlAssessment[];
};

export type Soc2Type1Report = {
  version: string;
  report_type: "soc2_type1_readiness";
  organization_id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  overall_status: ControlStatus;
  summary: string;
  control_summary: { pass: number; partial: number; fail: number };
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
      name: "Logical access — agent actions logged with policy decision",
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
          ? "No agent events in period — ingest signed events before audit."
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
      name: "Monitoring — tamper-evident export with witness proofs",
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
      name: "Change management — console actions audited",
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
  periodStart: Date;
  periodEnd: Date;
  soc2: ControlMappingDocument;
  euAiAct?: ControlMappingDocument;
}): Soc2Type1Report {
  const summaryParts = [
    `Period ${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}.`,
    `SOC 2 control mapping: ${input.soc2.overall_status} (${input.soc2.controls.length} controls assessed).`,
  ];
  if (input.euAiAct) {
    summaryParts.push(
      `EU AI Act Art. 12 mapping: ${input.euAiAct.overall_status}.`,
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
    version: "2026-05-p2",
    report_type: "soc2_type1_readiness",
    organization_id: input.organizationId,
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    generated_at: new Date().toISOString(),
    overall_status: input.soc2.overall_status,
    summary: summaryParts.join(" "),
    control_summary: controlSummary,
    recommendations,
    artifacts: [
      "soc2-type1-report.json",
      "control-mapping-soc2.json",
      "control-mapping-eu-ai-act.json",
      "events.ndjson",
      "manifest.json",
    ],
  };
}

export function buildControlMappingArtifacts(
  bundleType: string,
  input: {
    organizationId: string;
    periodStart: Date;
    periodEnd: Date;
    eventStats: EventPeriodStats;
    context: ExportContext;
  },
): Array<{ name: string; content: unknown }> {
  const artifacts: Array<{ name: string; content: unknown }> = [];
  const base = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eventStats: input.eventStats,
    context: input.context,
  };

  let soc2: ControlMappingDocument | undefined;
  let euAiAct: ControlMappingDocument | undefined;

  if (bundleType === "soc2" || bundleType === "combined") {
    soc2 = buildSoc2ControlMapping(base);
    artifacts.push({ name: "control-mapping-soc2.json", content: soc2 });
  }
  if (bundleType === "eu_ai_act" || bundleType === "combined") {
    euAiAct = buildEuAiActControlMapping(base);
    artifacts.push({ name: "control-mapping-eu-ai-act.json", content: euAiAct });
  }
  if (soc2) {
    artifacts.push({
      name: "soc2-type1-report.json",
      content: buildSoc2Type1Report({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        soc2,
        euAiAct,
      }),
    });
  }

  return artifacts;
}
