import type { BundleManifest } from "./build-bundle.js";
import type { EventPeriodStats } from "./event-stats.js";

export function buildExportReadme(
  manifest: BundleManifest,
  eventStats: EventPeriodStats,
): string {
  const mappingList = manifest.control_mapping_files
    .map((f) => `- \`${f}\``)
    .join("\n");

  return `# Salanor compliance export

Export ID: ${manifest.export_id}
Organization: ${manifest.organization_id}
Bundle type: ${manifest.bundle_type}
Period: ${manifest.period_start} → ${manifest.period_end}
Generated: ${manifest.generated_at}

## What this ZIP contains

| File | Description |
|------|-------------|
| \`events.ndjson\` | Signed APS-1 agent events (${manifest.stats.event_count} rows) |
| \`policies.json\` | Policy versions and rules |
| \`approvals.ndjson\` | Human approval decisions (${manifest.stats.approval_count}) |
| \`audit-log.ndjson\` | Console audit trail (${manifest.stats.audit_log_count}) |
| \`witness-roots.json\` | Merkle witness roots (${manifest.stats.witness_root_count}) |
| \`inclusion-proofs.ndjson\` | Inclusion proofs (${manifest.stats.inclusion_proof_count}) |
| \`manifest.json\` | Machine-readable index + integrity hash |
| **Control mapping (P2)** | Generated from live metrics — pass/partial/fail per control |

### Control mapping & SOC 2 Type I report

${mappingList || "_No control mapping for this bundle type._"}

Open \`soc2-type1-report.json\` for an executive readiness summary and recommendations.
Open \`control-mapping-soc2.json\` / \`control-mapping-eu-ai-act.json\` for per-control status,
metrics, and evidence file links.

**Period activity:** ${eventStats.total} events · ${eventStats.deny} denied · ${eventStats.obligation} obligations · ${eventStats.unique_agents} agents

## Integrity verification

1. Compute SHA-256 of this ZIP file (whole archive bytes).
2. Compare to \`integrity_hash\` in \`manifest.json\` and the console export row.
3. On Linux/macOS: \`shasum -a 256 ${manifest.export_id}.zip\`
4. On Windows PowerShell: \`Get-FileHash .\\${manifest.export_id}.zip -Algorithm SHA256\`

## Scheduled exports

Organizations can enable **monthly** auto-exports in the console (Compliance → Schedule).
Run \`pnpm compliance:schedule\` via cron to process due schedules.

---
Salanor · Aegis compliance export · ${manifest.version}
`;
}
