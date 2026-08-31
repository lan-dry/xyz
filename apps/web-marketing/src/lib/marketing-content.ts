/** Locked public brand lines. Use consistently on site, deck, SDK README, outreach. */
export const BRAND = {
  company: "Salanor",
  product: "Aegis",
  taglineShort: "Aegis by Salanor",
  taglineFull: "Aegis by Salanor: provenance and liability coverage for AI agents.",
  platformLine: "Infrastructure for agent systems you can audit",
} as const;

export const INTEGRATION_LOGOS = [
  "LangGraph",
  "OpenAI Agents SDK",
  "CrewAI",
  "Vercel AI SDK",
  "MCP Protocol",
  "Splunk",
  "Datadog",
  "Microsoft Sentinel",
  "AWS KMS",
  "GCP KMS",
  "HashiCorp Vault",
] as const;

export const HOME_METRICS = [
  { value: "BYOK", label: "Customer signing keys", detail: "Register public keys; sign in your KMS or agent runtime" },
  { value: "<5ms", label: "Policy p50 (target)", detail: "Rules engine on Check Policy hot path" },
  { value: "60s", label: "Witness cadence", detail: "Merkle batch worker (WITNESS_INTERVAL_MS)" },
  { value: "Live", label: "Design partner pilot", detail: "n8n, approvals, exports. See /trust" },
] as const;

/**
 * MARKETING COMPLIANCE (single source of truth for homepage + Aegis product page)
 *
 * When a framework ships in export ZIPs:
 * 1. Move the row from COMPLIANCE_ROADMAP → COMPLIANCE_AVAILABLE (below)
 * 2. Add mapping in services/aegis-api/src/compliance/control-mapping.ts
 * 3. Tick it in docs/COMPLIANCE_AND_ROADMAP.md § Live today
 *
 * The homepage "2+4" stat and compliance sections update automatically from these arrays.
 */
export const COMPLIANCE_AVAILABLE = [
  { name: "SOC 2", note: "Control mapping in export ZIPs" },
  { name: "EU AI Act", note: "Art. 12+ mapping in exports" },
] as const;

export const COMPLIANCE_ROADMAP = [
  { name: "NIST AI RMF", note: "Roadmap" },
  { name: "HIPAA", note: "BYOC path" },
  { name: "FedRAMP", note: "Architecture path" },
  { name: "ISO 42001", note: "Roadmap" },
] as const;

function complianceFrameworkStat(): string {
  return `${COMPLIANCE_AVAILABLE.length}+${COMPLIANCE_ROADMAP.length}`;
}

function complianceFrameworkDetail(): string {
  const live = COMPLIANCE_AVAILABLE.map((c) => c.name).join(" and ");
  const roadmap = COMPLIANCE_ROADMAP.map((c) => c.name).join(", ");
  return `${live} mapping ship in export ZIPs today. ${roadmap} are on the roadmap. Evidence mapping only, not certification claims.`;
}

export const AEGIS_COMPLIANCE = [
  ...COMPLIANCE_AVAILABLE.map((c) => ({
    name: c.name,
    note: c.note,
    available: true as const,
  })),
  ...COMPLIANCE_ROADMAP.map((c) => ({
    name: c.name,
    note: c.note,
    available: false as const,
  })),
];

export const PLATFORM_DATA_POINTS = [
  {
    id: "non-repudiation",
    value: "BYOK",
    label: "Customer-controlled keys",
    detail:
      "Register Ed25519 public keys in Console. Sign with AWS KMS, GCP KMS, Vault, or agent-held keys. Salanor verifies; it does not hold your private key.",
  },
  {
    id: "standard",
    value: "APS-1",
    label: "Open provenance standard",
    detail: "Published JSON Schema + verifier. Export bundles use the same wire format.",
  },
  {
    id: "regulatory",
    value: complianceFrameworkStat(),
    label: "Compliance frameworks",
    detail: complianceFrameworkDetail(),
  },
  {
    id: "verify",
    value: "<1s",
    label: "Trace reconstruction",
    detail:
      "Console rebuilds the signed causal chain interactively: click any step, view payload preview, open signed events.",
  },
  {
    id: "transparency",
    value: "60s",
    label: "Merkle witness cadence",
    detail:
      "witness:worker batches pending events every 60 seconds and publishes transparency log entries.",
  },
  {
    id: "insurance",
    value: "Preview",
    label: "Liability bridge (Aether)",
    detail: "Research program: risk telemetry for underwriters, built on the same Aegis ledger.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Instrument once",
    desc: "Connect via n8n Workflow Bridge, TypeScript GovernanceBridge, Python/Go SDK, or direct APS-1 ingest. LangGraph and CrewAI guides in docs.",
  },
  {
    step: "02",
    title: "Sign & enforce",
    desc: "Policies evaluate before risky tools run. Events are Ed25519-signed with BYOK keys you control.",
  },
  {
    step: "03",
    title: "Ledger & witness",
    desc: "Hash-chained append-only storage. Merkle roots batched every 60s into a transparency log.",
  },
  {
    step: "04",
    title: "Audit & comply",
    desc: "Reconstruct traces interactively in Console. Download compliance ZIPs. Stream OTLP logs to Splunk, Datadog, or Sentinel.",
  },
] as const;

export const INVESTOR_QUOTES = [
  {
    text: "The gap isn't model safety. It's decision defensibility when an agent acts on a Tuesday in March.",
    attr: "Representative concern · regulated industries (design partner interviews)",
  },
  {
    text: "We need cryptographically verifiable provenance before we scale autonomous workflows in regulated lines.",
    attr: "Representative concern · AI governance teams (design partner interviews)",
  },
] as const;

export const PRODUCTS = {
  aegis: {
    slug: "aegis",
    name: "Aegis",
    tag: "Provenance & Audit",
    status: "Live · design partners",
    brandLine: BRAND.taglineFull,
    headline: "Signed provenance for every agent action",
    subhead:
      "Cryptographically signed, append-only records. One SDK, no changes to agent logic. Built for teams that need evidence before they scale autonomy.",
    legalNote:
      "Admissibility depends on jurisdiction and counsel. Aegis supports evidentiary workflows; it does not guarantee court outcomes.",
    description:
      "Aegis is the managed control plane for APS-1 events: ingest, policy, human approvals, witness batches, transparency proofs, and compliance exports, scoped per organization.",
    features: [
      "APS-1 open standard with Ed25519 signed events",
      "BYOK: register customer public keys + optional AWS/GCP KMS sign",
      "Hash-chained append-only ledger with Merkle witness batches",
      "Policy engine with human approvals (email, Slack, PagerDuty, SMS)",
      "Compliance export bundles with SOC 2 / EU AI Act control mapping",
      "n8n Workflow Bridge + TypeScript, Python & Go SDKs",
    ],
    metrics: [
      {
        value: "<5ms",
        label: "Policy p50",
        gloss: "Median policy latency",
        detail: "Block-before-call proxy path",
      },
      {
        value: "RFC 6962",
        label: "Transparency",
        gloss: "Public tamper-evident log",
        detail: "External verifier, no Salanor trust",
      },
      {
        value: "BYOK",
        label: "Signing",
        gloss: "You hold the signing keys",
        detail: "AWS KMS, GCP KMS, Vault",
      },
      {
        value: "OTel",
        label: "SIEM export",
        gloss: "OpenTelemetry to your stack",
        detail: "Splunk, Datadog, Sentinel",
      },
    ],
    code: `import { evaluatePolicyViaApi, signAndIngest } from "@salanor/aegis";

// BYOK: private key stays in your runtime. Register public key in Console.
const decision = await evaluatePolicyViaApi(
  "https://api.salanor.com/v1/aegis",
  process.env.AEGIS_INGEST_TOKEN!,
  {
    organization_id: "org_…",
    agent_id: "agt_…",
    tool_name: "app.payments.transfer",
    payload: { amount_usd: 2500, recipient: "vendor@example.com" },
  },
);

if (decision.decision === "allow_with_obligation") {
  // Pause until human approves in Console
}`,
    compliance: AEGIS_COMPLIANCE,
  },
  aether: {
    slug: "aether",
    name: "Aether",
    tag: "Intelligence & Orchestration",
    status: "Research program",
    headline: "Risk intelligence on your provenance ledger",
    subhead:
      "Anomaly detection, agent risk scoring, and insurer-ready telemetry from Aegis data you already own. Raw events never leave your boundary.",
    description:
      "Aether sits above Aegis: it consumes signed event patterns (not payloads) to score workflows, recommend policies, and open the first generation of AI liability coverage.",
    features: [
      "Anomaly detection on agent action patterns",
      "Risk class scoring per tool and workflow",
      "Insurance Bridge with differentially-private telemetry",
      "Self-service policy marketplace",
      "Underwriter integrations (Munich Re, Chubb, Vouch)",
      "Actuarial-grade incident reports",
    ],
    metrics: [
      {
        value: "ε-DP",
        label: "Insurer feed",
        gloss: "Differential privacy for underwriters",
        detail: "Telemetry without raw PII export",
      },
      {
        value: "Real-time",
        label: "Risk scoring",
        gloss: "Live workflow risk classes",
        detail: "Per tool, per workflow class",
      },
      {
        value: "Market",
        label: "Policy templates",
        gloss: "Curated policy packs",
        detail: "Curated Rego packs",
      },
      {
        value: "Munich Re+",
        label: "Pilot lane",
        gloss: "Reinsurer design partners",
        detail: "Reinsurer design partners",
      },
    ],
    compliance: [] as { name: string; note: string }[],
  },
} as const;

/** @deprecated Use COMPLIANCE_AVAILABLE + COMPLIANCE_ROADMAP */
export const COMPLIANCE_STRIP = COMPLIANCE_AVAILABLE;

/** Pull quote for homepage + metadata */
export const FOUNDING_PULL_QUOTE =
  "We did not start Salanor because AI is exciting. We started it because the wrong people will pay if no one builds the receipts." as const;

/** Neutral platform map */
export const SALANOR_STACK = [
  {
    name: "Salanor",
    role: "Platform",
    description:
      "Provenance, identity, and liability coverage for production agent systems.",
  },
  {
    name: "Aegis",
    slug: "aegis",
    role: "Provenance & audit",
    status: "Live · design partners",
    description: "Signed APS-1 ledger, policy engine, human approvals, compliance exports.",
    href: "/products/aegis",
  },
  {
    name: "Aether",
    slug: "aether",
    role: "Intelligence & risk",
    status: "Research program",
    description:
      "Anomaly detection, risk scoring, and insurer-ready telemetry on the same ledger.",
    href: "/products/aether",
  },
  {
    name: "APS-1",
    role: "Open standard",
    description: "Event format and verifier CLI. Auditable without Salanor online.",
  },
] as const;

/** Sidebar on /about/founding */
export const FOUNDING_PRINCIPLES = [
  {
    title: "Receipts before features",
    body: "Nothing ships until it can be audited.",
  },
  {
    title: "Standards over silos",
    body: "We open-source the wire format; we compete on the substrate.",
  },
  {
    title: "Small, slow, durable",
    body: "We hire for ten-year careers, not eighteen-month exits.",
  },
  {
    title: "Boring in production",
    body: "Excitement is a code smell.",
  },
  {
    title: "Regulated industries first",
    body: "If it works for a central bank, it works for a startup.",
  },
] as const;

/** Grid on /about */
export const COMPANY_PRINCIPLES = [
  {
    title: "Provable over plausible",
    body: "If we cannot show our work, we don't ship it.",
  },
  {
    title: "Identity is infrastructure",
    body: "Models, agents, and sensors all need names.",
  },
  {
    title: "Boring on purpose",
    body: "Cryptography, ledgers, and policy engines are correct.",
  },
  {
    title: "Open where it matters",
    body: "Standards belong in the open. APS-1 is ours, given freely.",
  },
  {
    title: "Partner, don't conquer",
    body: "We work with the institutions whose problem we are solving.",
  },
  {
    title: "Hard environments first",
    body: "Designed for places where the network drops and the dust gets in.",
  },
] as const;
