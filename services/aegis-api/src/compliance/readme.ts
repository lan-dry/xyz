import type { BundleManifest } from "./build-bundle.js";
import type { EventPeriodStats } from "./event-stats.js";

export function buildExportReadme(
  manifest: BundleManifest,
  eventStats: EventPeriodStats,
): string {
  const mappingList = manifest.control_mapping_files
    .map((f) => `- \`${f}\` (draft — not counsel-reviewed)`)
    .join("\n");

  const orgLabel =
    manifest.organization_name?.trim() ||
    `organization ${manifest.organization_id}`;

  const vs = manifest.verification_summary;
  const unsignedCheckpoints = vs.checkpoints_total - vs.checkpoints_signed;
  const unsignedEvents = vs.events_total - vs.events_with_signature;

  return `# Salanor Aegis evidence export

Export ID: ${manifest.export_id}
Organization: ${orgLabel}
Bundle type: ${manifest.bundle_type}
Period: ${manifest.period_start} → ${manifest.period_end}
Generated: ${manifest.generated_at}

## Why this ZIP exists

This pack is a **machine-readable evidence archive** of what Aegis recorded for the period:

- which agent actions ran
- which policy decisions applied
- who approved held actions
- sealed event hashes, Ed25519 signatures, Merkle inclusion, and signed witness checkpoints
- public keys needed to check those signatures (\`public-keys.json\`)

**Use it to:** hand auditors / security reviewers the raw record, compare hashes, and reconstruct what happened.

**Do not use it as:** a SOC 2 Type I/II report, an EU AI Act conformity assessment, a BNR filing, legal proof, or proof that “nobody with the signing keys could rewrite history.” External public anchoring is not included.

${vs.claim}

## Decision legend

| In the files (\`policy_decision\`) | In the Console |
|-----------------------------------|----------------|
| \`allow\` | Allow |
| \`allow_with_obligation\` | Ask a person |
| \`deny\` | Stop |

## Verification summary

- Events with agent signature: ${vs.events_with_signature} / ${vs.events_total}${unsignedEvents > 0 ? " (some rows are hash-only)" : ""}
- Witness checkpoints signed: ${vs.checkpoints_signed} / ${vs.checkpoints_total}${unsignedCheckpoints > 0 ? " (some roots are unsigned)" : ""}

## How signatures work

**Agent events:** each row in \`events.ndjson\` may include \`sig_value_b64\` and \`sig_key_id\`. Look up \`sig_key_id\` in \`public-keys.json\` (\`purpose: agent_event_signature\`). The signature is Ed25519 over the APS-1 signing digest of the event.

**Witness checkpoints:** each root in \`witness-roots.json\` may include \`sig_value_b64\` and \`sig_key_id\` (typically \`witness_checkpoint_v1\`). Look up that key in \`public-keys.json\` (\`purpose: witness_checkpoint_signature\`). The signed message is:

\`SHA-256( UTF-8 of the lowercase root_hash hex string )\`

\`tree_size\`, \`interval_start\`, and \`interval_end\` are metadata; they are not part of the signed message.

## Files

| File | Description |
|------|-------------|
| \`events.ndjson\` | APS-1 events — ${manifest.stats.event_count} rows |
| \`policies.json\` | Active policies that have at least one rule |
| \`approvals.ndjson\` | Human approval decisions — ${manifest.stats.approval_count} |
| \`audit-log.ndjson\` | Console audit trail — ${manifest.stats.audit_log_count} |
| \`witness-roots.json\` | Merkle checkpoints — ${manifest.stats.witness_root_count} |
| \`inclusion-proofs.ndjson\` | Inclusion proofs — ${manifest.stats.inclusion_proof_count} |
| \`public-keys.json\` | Public keys for agent and checkpoint signatures |
| \`manifest.json\` | Index + per-file SHA-256 hashes |

${
  mappingList
    ? `### Optional draft framework maps

${mappingList}

These files are **draft internal mappings**, not certifications.
`
    : `This bundle type is the **evidence pack only** (no framework mapping JSON).
`
}

**Period activity:** ${eventStats.total} events · ${eventStats.deny} stopped · ${eventStats.obligation} sent for approval · ${eventStats.unique_agents} agents

## Integrity verification

1. Recompute SHA-256 of each listed file and compare to \`file_hashes\` in \`manifest.json\`.
2. The ZIP-wide SHA-256 is on the Console export row / API only (a ZIP cannot contain its own hash).
3. Windows: \`Get-FileHash .\\${manifest.export_id}.zip -Algorithm SHA256\`

## Limits

- This export counts signature **presence**. Full verify-at-export (every signature + inclusion proof + unbroken chain) and a signed manifest are not in this ZIP yet.
- Checkpoint anchoring is \`internal\`. An external public daily root hash is not included.
- Northwind demo data may include sample / seeded events. Treat demo orgs as sample unless the customer says otherwise.

## Scheduled exports

Enable monthly auto-exports under Evidence → Schedule (Team plan+). Production prepares those packs on the API host.

---
Salanor Aegis · Evidence export · ${manifest.version}
`;
}
