import type { BundleManifest } from "./build-bundle.js";
import type { EventPeriodStats } from "./event-stats.js";

export function buildExportReadme(
  manifest: BundleManifest,
  eventStats: EventPeriodStats,
): string {
  const mappingList = manifest.control_mapping_files
    .map((f) => `- \`${f}\``)
    .join("\n");

  const orgLabel =
    manifest.organization_name?.trim() ||
    `organization ${manifest.organization_id}`;

  const vs = manifest.verification_summary;

  return `# Salanor Aegis evidence archive

Export ID: ${manifest.export_id}
Organization: ${orgLabel}
Period: ${manifest.period_start} → ${manifest.period_end}
Generated: ${manifest.generated_at}

Evidence archive for this period: agent actions, policy decisions, approvals, and the hashes that seal them.

**Period:** ${eventStats.total} events · ${eventStats.deny} stopped · ${eventStats.obligation} sent for approval · ${eventStats.unique_agents} agents
Signed events: ${vs.events_with_signature} / ${vs.events_total}. Signed checkpoints: ${vs.checkpoints_signed} / ${vs.checkpoints_total}.

## What is in the ZIP

| File | Contents |
|------|----------|
| \`events.ndjson\` | Events — ${manifest.stats.event_count} |
| \`policies.json\` | Active policies |
| \`approvals.ndjson\` | Approvals — ${manifest.stats.approval_count} |
| \`audit-log.ndjson\` | Console audit log — ${manifest.stats.audit_log_count} |
| \`witness-roots.json\` | Checkpoints — ${manifest.stats.witness_root_count} |
| \`inclusion-proofs.ndjson\` | Inclusion proofs — ${manifest.stats.inclusion_proof_count} |
| \`public-keys.json\` | Public keys for the signatures |
| \`manifest.json\` | File list and SHA-256 hashes |

${mappingList ? `Also included:\n\n${mappingList}\n` : ""}
Decisions in the files: \`allow\` (allowed), \`allow_with_obligation\` (needs a person), \`deny\` (stopped).

## Check the hashes

1. Hash each file with SHA-256 and compare it to \`file_hashes\` in \`manifest.json\`.
2. The hash of the whole ZIP is on the Evidence page. A ZIP cannot store its own hash.
3. Windows: \`Get-FileHash .\\${manifest.export_id}.zip -Algorithm SHA256\`

Event signatures are Ed25519. Match \`sig_key_id\` to \`public-keys.json\`. Checkpoint signatures cover the SHA-256 of the lowercase root hash.

---
Salanor Aegis · Evidence archive · ${manifest.version}
`;
}
