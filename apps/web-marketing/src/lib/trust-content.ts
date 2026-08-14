/** Platform capability matrix for /trust. Keep in sync with product reality. */
export type TrustStatus = "live" | "pilot" | "roadmap";

export type TrustFeature = {
  id: string;
  feature: string;
  status: TrustStatus;
  notes: string;
};

export const TRUST_FEATURES: TrustFeature[] = [
  {
    id: "aps1-signing",
    feature: "APS-1 Ed25519 signed events",
    status: "live",
    notes: "Every ingested event verified against agent public key.",
  },
  {
    id: "byok-customer",
    feature: "BYOK (customer-held signing keys)",
    status: "live",
    notes:
      "Register public keys via Console (Agents → Register BYOK key). Private key never sent to Salanor. Sign with your KMS or local HSM.",
  },
  {
    id: "byok-aws-kms",
    feature: "BYOK (AWS KMS server sign)",
    status: "live",
    notes:
      "Optional kms_provider=aws + kms_key_arn for bridge/human-approval paths. Salanor calls kms:Sign; no raw private key stored.",
  },
  {
    id: "byok-gcp-kms",
    feature: "BYOK (GCP Cloud KMS server sign)",
    status: "pilot",
    notes: "Requires GCP_KMS_ACCESS_TOKEN on API service. Customer grants asymmetricSign on key version.",
  },
  {
    id: "policy-gate",
    feature: "Policy engine (allow / deny / require approval)",
    status: "live",
    notes: "Multiple active policies merged at evaluation. Amount min/max rules supported.",
  },
  {
    id: "approvals-hitl",
    feature: "Human approvals + email / Slack / PagerDuty / SMS",
    status: "live",
    notes: "Configurable TTL per org. Branded HTML approval emails.",
  },
  {
    id: "n8n-bridge",
    feature: "n8n Workflow Bridge",
    status: "live",
    notes: "Community node published. Check Policy + Record Run smoke test documented.",
  },
  {
    id: "trace-replay",
    feature: "Interactive trace reconstruction",
    status: "live",
    notes:
      "Console rebuilds signed causal chain in milliseconds. Click any step; side-effectful tools marked local_rerun.",
  },
  {
    id: "witness-60s",
    feature: "Merkle witness batching (60s cadence)",
    status: "live",
    notes:
      "witness:worker on Railway (60s). Batches pending events + transparency log. History in Platform Ops → Workers.",
  },
  {
    id: "compliance-export",
    feature: "Compliance export bundles (SOC 2 / EU AI Act mapping)",
    status: "live",
    notes: "One-time ZIP download. Control mapping in bundle; not a certification.",
  },
  {
    id: "compliance-schedule",
    feature: "Monthly scheduled exports",
    status: "live",
    notes: "Daily cron: compliance:worker + COMPLIANCE_EXPORT_DIR volume. Run history in Platform Ops → Workers.",
  },
  {
    id: "otel-siem",
    feature: "OTLP logs to Splunk / Datadog / Sentinel",
    status: "live",
    notes: "Configure in Console → Settings → Integrations. Fires on each ingested event.",
  },
  {
    id: "langgraph",
    feature: "LangGraph integration",
    status: "live",
    notes: "wrapLangGraphTool() in @salanor/aegis SDK + integration guide.",
  },
  {
    id: "crewai",
    feature: "CrewAI integration",
    status: "live",
    notes: "governed_tool() decorator in salanor-aegis-ledger + integration guide.",
  },
  {
    id: "soc2-cert",
    feature: "SOC 2 Type II certification",
    status: "roadmap",
    notes: "Export mapping available now. Formal audit target Q4 2026.",
  },
  {
    id: "fedramp",
    feature: "FedRAMP Moderate",
    status: "roadmap",
    notes: "Architecture path documented. Target Q2 2027.",
  },
];

export const TRUST_STATUS_LABEL: Record<TrustStatus, string> = {
  live: "Live",
  pilot: "Pilot",
  roadmap: "Roadmap",
};
