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
    feature: "Customer-controlled signing keys (where configured)",
    status: "live",
    notes:
      "Register public keys via Console. Private key never sent to Salanor. Sign with your KMS or local HSM.",
  },
  {
    id: "byok-aws-kms",
    feature: "AWS KMS server Sign",
    status: "pilot",
    notes:
      "Optional kms_provider=aws + kms_key_arn. Requires AWS credentials; fails clearly when missing. Partial until KeyProvider P1 complete.",
  },
  {
    id: "byok-gcp-kms",
    feature: "GCP Cloud KMS server Sign",
    status: "pilot",
    notes: "Requires GCP credentials / access token. Customer grants asymmetricSign on key version. Partial until P1 complete.",
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
      "Console rebuilds the signed causal chain interactively. Click any step; side-effectful tools marked local_rerun. No absolute-time SLA.",
  },
  {
    id: "witness-60s",
    feature: "Merkle witness batching (configurable cadence)",
    status: "live",
    notes:
      "Default WITNESS_INTERVAL_MS ≈ 60s on Railway — documented cadence, not a guarantee. Batches pending events + transparency log.",
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
    id: "manual-billing",
    feature: "Invoice billing (Team / Enterprise)",
    status: "live",
    notes:
      "Platform Ops records pending invoice → mark paid. Use when Stripe is unavailable in Salanor's country.",
  },
  {
    id: "stripe-checkout",
    feature: "Stripe self-serve checkout",
    status: "roadmap",
    notes:
      "Requires Stripe account in a supported country. Until then, Team/Enterprise via invoice.",
  },
  {
    id: "soc2-cert",
    feature: "SOC 2 Type II certification",
    status: "roadmap",
    notes:
      "Export bundle includes control-mapping-soc2.json and soc2-readiness-summary.json (readiness mapping, not a CPA attestation). Formal Salanor audit target Q4 2026.",
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
