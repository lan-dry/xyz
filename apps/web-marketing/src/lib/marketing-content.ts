/** Locked public brand lines — use consistently on site, deck, SDK README, outreach. */
export const BRAND = {
  company: "Salanor",
  product: "Aegis",
  taglineShort: "Aegis by Salanor",
  taglineFull: "Aegis, by Salanor — the provenance and liability layer for AI agents.",
  platformLine: "Trust infrastructure for agentic systems",
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
  { value: "<5ms", label: "SDK overhead p50", detail: "Policy + sign on the hot path" },
  { value: "50k", label: "Events / sec / region", detail: "Horizontally scaled ingest" },
  { value: "7yr", label: "Ledger retention", detail: "WORM cold storage default" },
  { value: "0", label: "Breaking changes", detail: "Drop-in wrap(), same agent code" },
] as const;

export const PLATFORM_DATA_POINTS = [
  {
    id: "non-repudiation",
    value: "BYOK",
    label: "Customer-controlled keys",
    detail: "Ed25519 signing in your KMS. Salanor cannot rewrite history.",
  },
  {
    id: "standard",
    value: "APS-1",
    label: "Open provenance standard",
    detail: "CC BY 4.0 spec. MIT verifier CLI. No vendor lock-in on the format.",
  },
  {
    id: "regulatory",
    value: "6+",
    label: "Regimes at GA",
    detail: "EU AI Act, SOC 2, NIST AI RMF, HIPAA paths, FedRAMP target.",
  },
  {
    id: "verify",
    value: "30s",
    label: "Trace reconstruction",
    detail: "Causal chain from obligation to tool call to signed event.",
  },
  {
    id: "transparency",
    value: "60s",
    label: "Merkle witness cadence",
    detail: "RFC 6962-style log. Third parties detect tamper without your keys.",
  },
  {
    id: "insurance",
    value: "2027",
    label: "Liability bridge",
    detail: "Aether exports differentially-private telemetry to underwriters.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Instrument once",
    desc: "Connect agents to the Salanor control plane (Aegis SDK today). Every tool call and LLM turn is captured — LangGraph, CrewAI, OpenAI Agents, MCP.",
  },
  {
    step: "02",
    title: "Sign & enforce",
    desc: "OPA/WASM policies evaluate in under 5ms. Events are signed with keys that never leave your infrastructure.",
  },
  {
    step: "03",
    title: "Ledger & witness",
    desc: "Hash-chained append-only storage. Merkle roots published to a public transparency log on a fixed cadence.",
  },
  {
    step: "04",
    title: "Audit & comply",
    desc: "Reconstruct traces in seconds. Export SOC 2, EU AI Act, and NIST bundles. Stream OTel to your SIEM.",
  },
] as const;

export const INVESTOR_QUOTES = [
  {
    text: "The gap isn't model safety — it's decision defensibility when an agent acts on a Tuesday in March.",
    attr: "Model risk · top-15 US bank (design partner)",
  },
  {
    text: "We need court-admissible provenance before we scale autonomous workflows in regulated lines.",
    attr: "AI governance · national health system",
  },
] as const;

export const PRODUCTS = {
  aegis: {
    slug: "aegis",
    name: "Aegis",
    tag: "Provenance & Audit",
    status: "GA Q4 2026",
    icon: "🔐",
    brandLine: BRAND.taglineFull,
    headline: "Litigation-ready provenance for every agent action",
    subhead:
      "Cryptographically signed, append-only infrastructure. One SDK, zero changes to agent logic. The trust substrate enterprises deploy before scaling autonomy.",
    legalNote:
      "Admissibility depends on jurisdiction and counsel. Aegis is built to support evidentiary workflows—not a guarantee of court outcomes.",
    description:
      "Aegis is the managed control plane for APS-1 events: ingest, policy, human approvals, witness batches, transparency proofs, and compliance exports — all scoped per organization.",
    features: [
      "APS-1 open standard — Ed25519 signed events",
      "Hash-chained append-only ledger, WORM cold storage",
      "Public Merkle transparency log (RFC 6962)",
      "OPA/WASM policy engine with human approvals",
      "EU AI Act, SOC 2, NIST AI RMF compliance bundles",
      "TypeScript, Python & Go SDKs",
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
    code: `import { aegis } from "@salanor/aegis";

const agent = aegis.wrap(myLangGraphAgent, {
  organization: "acme",
  agentDid: "did:agent:acme:fin-bot-prod",
  policy: "prod-finance",
  redact: ["customer.email", "card.*"],
});

await agent.invoke({ task: "refund order #4421" });
const proof = await aegis.verify(eventId);`,
    compliance: [
      { name: "SOC 2 Type II", note: "Q4 2026" },
      { name: "EU AI Act", note: "Art. 12, 14, 19, 26" },
      { name: "NIST AI RMF", note: "Govern · Map · Manage" },
      { name: "HIPAA", note: "BYOC & on-prem" },
      { name: "FedRAMP Mod.", note: "Target Q2 2027" },
      { name: "ISO 42001", note: "AI Management" },
    ],
  },
  aether: {
    slug: "aether",
    name: "Aether",
    tag: "Intelligence & Orchestration",
    status: "Coming 2027",
    icon: "⚡",
    headline: "Risk intelligence built on your provenance ledger",
    subhead:
      "Anomaly detection, agent risk scoring, and insurer-ready telemetry — powered by Aegis data you already own. Raw events never leave your boundary.",
    description:
      "Aether sits above Aegis: it consumes signed event patterns (not payloads) to score workflows, recommend policies, and open the first generation of AI liability coverage.",
    features: [
      "Anomaly detection on agent action patterns",
      "Risk class scoring per tool and workflow",
      "Insurance Bridge — differentially-private telemetry",
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

export const COMPLIANCE_STRIP = [
  { name: "SOC 2", note: "Type II path" },
  { name: "EU AI Act", note: "Art. 12+" },
  { name: "NIST AI RMF", note: "Mapped exports" },
  { name: "HIPAA", note: "BYOC" },
] as const;

/** Pull quote for homepage + metadata */
export const FOUNDING_PULL_QUOTE =
  "We did not start Salanor because AI is exciting. We started it because the wrong people will pay if no one builds the receipts." as const;

/** Neutral platform map — clarity without pivot narrative */
export const SALANOR_STACK = [
  {
    name: "Salanor",
    role: "Platform",
    description:
      "Trust infrastructure for agentic AI — provenance, identity, and liability coverage.",
  },
  {
    name: "Aegis",
    slug: "aegis",
    role: "Provenance & audit",
    status: "GA Q4 2026",
    description: "Signed APS-1 ledger, policy engine, human approvals, compliance exports.",
    href: "/products/aegis",
  },
  {
    name: "Aether",
    slug: "aether",
    role: "Intelligence & risk",
    status: "Research · 2027",
    description:
      "Anomaly detection, risk scoring, and insurer-ready telemetry on the same ledger.",
    href: "/products/aether",
  },
  {
    name: "APS-1",
    role: "Open standard",
    description: "Event format and verifier CLI — auditable without Salanor online.",
  },
] as const;

/** Sidebar on /about/founding — how we committed at incorporation */
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

/** Grid on /about — operating principles today */
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
    title: "Built for hard environments",
    body: "Designed for places where the network drops and the dust gets in.",
  },
] as const;
