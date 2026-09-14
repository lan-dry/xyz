import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import archiver from "archiver";
import { buildControlMappingArtifacts } from "./control-mapping.js";
import type { ExportContext } from "./gather-context.js";
import { computeEventPeriodStats } from "./event-stats.js";
import { sha256FileHex } from "./integrity.js";
import { buildExportReadme } from "./readme.js";

export type ExportEventRow = {
  event_id: string;
  trace_id: string;
  agent_id: string;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  event_hash: string;
  emitted_at: Date;
  payload: unknown;
};

export type BundleManifest = {
  version: string;
  export_id: string;
  organization_id: string;
  bundle_type: string;
  period_start: string;
  period_end: string;
  event_count: number;
  generated_at: string;
  integrity_hash: string | null;
  artifacts: string[];
  control_mapping_files: string[];
  stats: {
    event_count: number;
    policy_count: number;
    approval_count: number;
    audit_log_count: number;
    witness_root_count: number;
    inclusion_proof_count: number;
  };
};

function ndjsonLines(rows: unknown[]): string {
  if (rows.length === 0) {
    return "";
  }
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

export async function buildComplianceZip(input: {
  outputPath: string;
  exportId: string;
  organizationId: string;
  bundleType: string;
  periodStart: Date;
  periodEnd: Date;
  events: ExportEventRow[];
  context: ExportContext;
}): Promise<{ integrityHash: string; byteSize: number; manifest: BundleManifest }> {
  await mkdir(dirname(input.outputPath), { recursive: true });

  const eventStats = computeEventPeriodStats(input.events);
  const controlArtifacts = buildControlMappingArtifacts(input.bundleType, {
    organizationId: input.organizationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eventStats,
    context: input.context,
  });

  const stats = {
    event_count: input.events.length,
    policy_count: input.context.policies.length,
    approval_count: input.context.approvals.length,
    audit_log_count: input.context.auditLog.length,
    witness_root_count: input.context.witnessRoots.length,
    inclusion_proof_count: input.context.inclusionProofs.length,
  };

  const baseArtifacts = [
    "README.md",
    "events.ndjson",
    "policies.json",
    "approvals.ndjson",
    "audit-log.ndjson",
    "witness-roots.json",
    "inclusion-proofs.ndjson",
    "manifest.json",
  ];
  const controlMappingFiles = controlArtifacts.map((a) => a.name);

  const manifest: BundleManifest = {
    version: "2026-05-p2",
    export_id: input.exportId,
    organization_id: input.organizationId,
    bundle_type: input.bundleType,
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    event_count: input.events.length,
    generated_at: new Date().toISOString(),
    integrity_hash: null,
    artifacts: [...baseArtifacts, ...controlMappingFiles],
    control_mapping_files: controlMappingFiles,
    stats,
  };

  const readme = buildExportReadme(manifest, eventStats);

  const ndjson = ndjsonLines(
    input.events.map((e) => ({
      event_id: e.event_id,
      trace_id: e.trace_id,
      agent_id: e.agent_id,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      event_hash: e.event_hash,
      emitted_at: e.emitted_at.toISOString(),
      payload: e.payload,
    })),
  );

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(input.outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", reject);
    output.on("error", reject);
    archive.pipe(output);

    archive.append(readme, { name: "README.md" });
    archive.append(ndjson, { name: "events.ndjson" });
    archive.append(JSON.stringify(input.context.policies, null, 2), {
      name: "policies.json",
    });
    archive.append(ndjsonLines(input.context.approvals), {
      name: "approvals.ndjson",
    });
    archive.append(ndjsonLines(input.context.auditLog), {
      name: "audit-log.ndjson",
    });
    archive.append(JSON.stringify(input.context.witnessRoots, null, 2), {
      name: "witness-roots.json",
    });
    archive.append(ndjsonLines(input.context.inclusionProofs), {
      name: "inclusion-proofs.ndjson",
    });
    for (const artifact of controlArtifacts) {
      archive.append(JSON.stringify(artifact.content, null, 2), {
        name: artifact.name,
      });
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    void archive.finalize();
  });

  const integrityHash = await sha256FileHex(input.outputPath);
  manifest.integrity_hash = integrityHash;

  const { size } = await stat(input.outputPath);
  return { integrityHash, byteSize: size, manifest };
}
