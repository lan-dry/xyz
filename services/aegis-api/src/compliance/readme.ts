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
| \`witness-roots.json\` | Salanor witness checkpoints (signed) — ${manifest.stats.witness_root_count}. Externally anchored roots are labelled as such. Includes root signature and RFC 3161 timestamp token when present. |
| \`inclusion-proofs.ndjson\` | Inclusion proofs (merkle path + root) — ${manifest.stats.inclusion_proof_count} |
| \`public-keys.json\` | Public keys for the signatures |
| \`manifest.json\` | File list and SHA-256 hashes |

${mappingList ? `Also included:\n\n${mappingList}\n` : ""}
Decisions in the files: \`allow\` (allowed), \`allow_with_obligation\` (needs a person), \`deny\` (stopped).

## Merkle hashing rule

- **Leaf:** the event hash (\`event.event_hash\`) used verbatim as the leaf string.
- **Internal node:** SHA-256 of the **left hex string followed by the right hex string** (UTF-8 concatenation), i.e. \`SHA-256(left + right)\`. When a level has an odd count, the last hash is paired with itself.
- **Inclusion:** start from the leaf, walk each \`merkle_path\` step (\`position\` is the sibling side), and recompute until the stated \`root_hash\`.
- **Checkpoint signature:** Ed25519 over \`SHA-256(UTF-8 of lowercase root_hash hex)\`. Label: **Salanor witness checkpoint (signed)** unless \`anchoring_type\` is external (bitcoin/ethereum).
- **Timestamp:** RFC 3161 token over the root hash (message imprint); stored on the root as \`tsa_token_b64\`.

## Check the hashes

1. Hash each file with SHA-256 and compare it to \`file_hashes\` in \`manifest.json\`.
2. The SHA-256 of the whole ZIP is shown on the Evidence page / API. It is **not** stored inside the ZIP (a ZIP cannot contain its own hash), so \`manifest.json\` has no empty \`integrity_hash\` field.
3. Windows: \`Get-FileHash .\\${manifest.export_id}.zip -Algorithm SHA256\`

Event signatures are Ed25519. Match \`sig_key_id\` to \`public-keys.json\`. Checkpoint signatures cover the SHA-256 of the lowercase root hash.

Offline inclusion: use \`aegis-verify\` on an evidence bundle, or recompute the Merkle path as above.

---
Salanor Aegis · Evidence archive · ${manifest.version}
`;
}
