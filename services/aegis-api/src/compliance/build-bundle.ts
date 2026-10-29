import { createHash } from "node:crypto";
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
  sig_alg?: string | null;
  sig_value_b64?: string | null;
  key_id?: string | null;
  emitted_at: Date;
  payload: unknown;
};

export type BundleManifest = {
  version: string;
  export_id: string;
  organization_id: string;
  organization_name: string | null;
  bundle_type: string;
  period_start: string;
  period_end: string;
  event_count: number;
  generated_at: string;
  /** Always null inside the ZIP — a ZIP cannot contain its own hash. See console / API. */
  integrity_hash: string | null;
  file_hashes: Record<string, string>;
  artifacts: string[];
  control_mapping_files: string[];
  verification_summary: {
    events_total: number;
    events_with_signature: number;
    checkpoints_total: number;
    checkpoints_signed: number;
    claim: string;
  };
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

function sha256Utf8Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isWitnessRootSigned(root: unknown): boolean {
  if (!root || typeof root !== "object") return false;
  const sig = (root as { sig_value_b64?: unknown }).sig_value_b64;
  return typeof sig === "string" && sig.length > 0;
}

export async function buildComplianceZip(input: {
  outputPath: string;
  exportId: string;
  organizationId: string;
  organizationName?: string | null;
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
    organizationName: input.organizationName ?? null,
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

  const eventsWithSig = input.events.filter(
    (e) => typeof e.sig_value_b64 === "string" && e.sig_value_b64.length > 0,
  ).length;
  const checkpointsSigned = input.context.witnessRoots.filter(isWitnessRootSigned).length;

  const verification_summary = {
    events_total: input.events.length,
    events_with_signature: eventsWithSig,
    checkpoints_total: input.context.witnessRoots.length,
    checkpoints_signed: checkpointsSigned,
    claim:
      checkpointsSigned === input.context.witnessRoots.length &&
      input.context.witnessRoots.length > 0 &&
      eventsWithSig === input.events.length &&
      input.events.length > 0
        ? "This ZIP packages the sealed operational record (signed events + signed checkpoints). It supports audit reconstruction. It does not certify regulatory conformity, and it does not include an external public anchor."
        : "Partial cryptographic coverage. Use for internal reconstruction. Do not present unsigned events or checkpoints as non-repudiation against database admins.",
  };

  const baseArtifacts = [
    "README.md",
    "events.ndjson",
    "policies.json",
    "approvals.ndjson",
    "audit-log.ndjson",
    "witness-roots.json",
    "inclusion-proofs.ndjson",
    "public-keys.json",
    "manifest.json",
  ];
  const controlMappingFiles = controlArtifacts.map((a) => a.name);

  const eventsNdjson = ndjsonLines(
    input.events.map((e) => ({
      event_id: e.event_id,
      trace_id: e.trace_id,
      agent_id: e.agent_id,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      event_hash: e.event_hash,
      sig_alg: e.sig_alg ?? null,
      sig_value_b64: e.sig_value_b64 ?? null,
      sig_key_id: e.key_id ?? null,
      emitted_at: e.emitted_at.toISOString(),
      payload: e.payload,
    })),
  );
  const policiesJson = JSON.stringify(input.context.policies, null, 2);
  const approvalsNdjson = ndjsonLines(input.context.approvals);
  const auditNdjson = ndjsonLines(input.context.auditLog);
  const witnessRootsJson = JSON.stringify(input.context.witnessRoots, null, 2);
  const inclusionNdjson = ndjsonLines(input.context.inclusionProofs);
  const publicKeysJson = JSON.stringify(
    {
      version: "2026-10-export",
      keys: input.context.publicKeys,
      notes: {
        agent_event_signature:
          "Ed25519 over the APS-1 signing digest for each event (see packages/aegis-ledger-sdk digest). Verify with the public_key_b64 for sig_key_id.",
        witness_checkpoint_signature:
          "Ed25519 over SHA-256(UTF-8 of lowercase root_hash hex). Fields tree_size and interval are not part of the signed message; they are metadata next to the signed root_hash.",
      },
    },
    null,
    2,
  );
  const controlBodies = controlArtifacts.map((a) => ({
    name: a.name,
    body: JSON.stringify(a.content, null, 2),
  }));

  const file_hashes: Record<string, string> = {
    "events.ndjson": sha256Utf8Hex(eventsNdjson),
    "policies.json": sha256Utf8Hex(policiesJson),
    "approvals.ndjson": sha256Utf8Hex(approvalsNdjson),
    "audit-log.ndjson": sha256Utf8Hex(auditNdjson),
    "witness-roots.json": sha256Utf8Hex(witnessRootsJson),
    "inclusion-proofs.ndjson": sha256Utf8Hex(inclusionNdjson),
    "public-keys.json": sha256Utf8Hex(publicKeysJson),
  };
  for (const artifact of controlBodies) {
    file_hashes[artifact.name] = sha256Utf8Hex(artifact.body);
  }

  const manifestWithoutReadme: BundleManifest = {
    version: "2026-10-export",
    export_id: input.exportId,
    organization_id: input.organizationId,
    organization_name: input.organizationName ?? null,
    bundle_type: input.bundleType,
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    event_count: input.events.length,
    generated_at: new Date().toISOString(),
    integrity_hash: null,
    file_hashes,
    artifacts: [...baseArtifacts, ...controlMappingFiles],
    control_mapping_files: controlMappingFiles,
    verification_summary,
    stats,
  };

  const readmeDraft = buildExportReadme(manifestWithoutReadme, eventStats);
  file_hashes["README.md"] = sha256Utf8Hex(readmeDraft);

  const manifest: BundleManifest = {
    ...manifestWithoutReadme,
    file_hashes: { ...file_hashes },
  };
  // Re-render README with final file_hashes (still excludes self-hash of manifest.json).
  const readme = buildExportReadme(manifest, eventStats);
  file_hashes["README.md"] = sha256Utf8Hex(readme);
  manifest.file_hashes = { ...file_hashes };
  const finalManifestJson = JSON.stringify(manifest, null, 2);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(input.outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", reject);
    output.on("error", reject);
    archive.pipe(output);

    archive.append(readme, { name: "README.md" });
    archive.append(eventsNdjson, { name: "events.ndjson" });
    archive.append(policiesJson, { name: "policies.json" });
    archive.append(approvalsNdjson, { name: "approvals.ndjson" });
    archive.append(auditNdjson, { name: "audit-log.ndjson" });
    archive.append(witnessRootsJson, { name: "witness-roots.json" });
    archive.append(inclusionNdjson, { name: "inclusion-proofs.ndjson" });
    archive.append(publicKeysJson, { name: "public-keys.json" });
    for (const artifact of controlBodies) {
      archive.append(artifact.body, { name: artifact.name });
    }
    archive.append(finalManifestJson, { name: "manifest.json" });

    void archive.finalize();
  });

  const integrityHash = await sha256FileHex(input.outputPath);
  const { size } = await stat(input.outputPath);
  return {
    integrityHash,
    byteSize: size,
    manifest: { ...manifest, integrity_hash: integrityHash },
  };
}
