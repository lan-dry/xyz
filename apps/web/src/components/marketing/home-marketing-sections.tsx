import type { ReactNode } from "react";
import Link from "next/link";

import { SectionLabel } from "@/components/marketing/section-label";
import { SdkCodeTabs } from "@/components/marketing/sdk-code-tabs";

const QUOTES = [
  {
    text: "We can defend the model. We cannot defend any specific decision the model made on a Tuesday in March.",
    attr: "Model risk lead · top-15 US bank",
  },
  {
    text: "We disabled triage assist for six weeks because we could not produce an audit trail the inspector accepted.",
    attr: "AI governance · national health system",
  },
  {
    text: "Our last enterprise deal stalled for four months on one question: 'How would you reproduce this decision in a year?'",
    attr: "CTO · AI-native fintech",
  },
] as const;

const PRIMITIVES = [
  {
    num: "01 — CAPTURE",
    name: "Capture",
    desc: "A typed SDK call wraps any decision your application makes. Inputs, model identity, policy reference, evidence, outcome — recorded as a structured APS-1 event. Sub-millisecond on the hot path.",
  },
  {
    num: "02 — ANCHOR",
    name: "Anchor",
    desc: "Each event is hashed into a Merkle tree. Roots are committed to a tamper-evident ledger and anchored to Bitcoin via OpenTimestamps. Tampering becomes observably detectable by any third party.",
  },
  {
    num: "03 — REPLAY",
    name: "Replay",
    desc: "Given an event ID, reconstruct the decision exactly. Same inputs, same model version, same policy state. Three determinism tiers recorded per event so auditors know exactly what guarantee applies.",
  },
  {
    num: "04 — EXPORT",
    name: "Export",
    desc: "Generate signed evidence packs for regulators, auditors, plaintiffs, or board reporting. PDF and JSON with cryptographic proofs verifiable offline by anyone with the public key bundle.",
  },
] as const;

const ARCH_FEATURES = [
  {
    title: "Tamper-evident by design",
    desc: "SHA-256 hash chaining makes any modification to historical events detectable by any verifier — no Salanor involvement required.",
    icon: (
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    ),
  },
  {
    title: "Three deployment topologies",
    desc: "Managed, Hybrid (ledger in your VPC), or fully self-hosted. Same binaries, same APS-1 format. No managed-only features, ever.",
    icon: (
      <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    ),
  },
  {
    title: "Framework-agnostic SDK",
    desc: "Python and TypeScript at launch. Works with LangGraph, CrewAI, OpenAI Agents, or any code that makes decisions. HTTP fallback for everything else.",
    icon: (
      <>
        <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </>
    ),
  },
] as const;

const SDK_PROPS = [
  {
    strong: "Returns immediately.",
    rest: "aegis.record() writes to local SQLite spool and returns the event_id. Network is fully async.",
  },
  {
    strong: "Never raises on network errors.",
    rest: "Local spool guarantees no event loss even if your process crashes before the HTTP write completes.",
  },
  {
    strong: "Pluggable signing.",
    rest: "Local key file for development. AWS KMS, GCP KMS, or HashiCorp Vault for production. Key never leaves your infrastructure.",
  },
  {
    strong: "Hot-path overhead under 1ms.",
    rest: "Hard constraint. Profiled on every release.",
  },
] as const;

const PLANS = [
  {
    name: "Developer",
    price: "Free",
    priceSuffix: null,
    events: "Up to 100k events / month",
    featured: false,
    features: [
      "Python & TypeScript SDKs",
      "Managed deployment · US-East",
      "APS-1 event ledger",
      "Bitcoin anchoring",
      "Evidence pack export",
      "Community support",
    ],
  },
  {
    name: "Team",
    price: "$2,000",
    priceSuffix: "/ month",
    events: "1M included events + $0.0008 / event over",
    featured: true,
    features: [
      "Everything in Developer",
      "US and EU regions",
      "Email support · SLA",
      "HIPAA BAA available",
      "Customer-managed KMS (BYOK)",
      "Audit API access",
    ],
  },
  {
    name: "Business",
    price: "$10,000",
    priceSuffix: "/ month",
    events: "5M included events + $0.0005 / event over",
    featured: false,
    features: [
      "Everything in Team",
      "Hybrid deployment (ledger in your VPC)",
      "99.9% SLA",
      "Dedicated support engineer",
      "SOC 2 Type II report",
      "Regulator-ready evidence packs",
    ],
  },
] as const;

const APS_POINTS = [
  "Prevents vendor lock-in. The format outlives any single company — including us.",
  "Creates a network effect. More emitters means more value for every verifier in the ecosystem.",
  "We monetize the managed control plane. Not the specification.",
  "Working group: Salanor + design-partner CISOs + academic cryptographer + insurer.",
] as const;

const AETHER_TRACKS = [
  {
    label: "Track 01",
    title: "Provenance",
    desc: "Cryptographic and architectural foundations for verifiable agent behavior across vendors and frameworks.",
  },
  {
    label: "Track 02",
    title: "Replayability",
    desc: "Determinism, model versioning, and reconstruction of historical decisions. The three-tier model.",
  },
  {
    label: "Track 03",
    title: "Standards",
    desc: "APS-1 — the Agent Provenance Standard, drafted with regulators and operators in the open.",
  },
  {
    label: "Track 04",
    title: "Policy",
    desc: "How EU AI Act, NIST AI RMF, and emerging frameworks translate into engineering primitives.",
  },
] as const;

function MarketingContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function HomeMarketingSections() {
  return (
    <>
      <section id="about" className="scroll-mt-28 bg-ink py-20 text-bone sm:py-28 lg:py-32">
        <MarketingContainer>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <SectionLabel>The problem</SectionLabel>
              <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                Every automated decision
                <br />
                needs to be
                <br />
                <em className="text-teal-soft not-italic">on the record.</em>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-bone/55">
                An automated system makes a decision. A customer contests it. Somewhere in the building, a junior analyst
                is asked to reconstruct it from logs that were never designed to be read by humans, against a model
                that has since been retrained, under a policy that has since been revised.
              </p>
              <p className="mt-4 text-base leading-relaxed text-bone/55">
                Best case: it takes weeks. Common case: nobody can reconstruct it at all.
              </p>
              <p className="mt-4 text-base leading-relaxed text-bone/55">
                This is the gating problem for every meaningful deployment of AI in finance, healthcare, insurance,
                government, and HR.
              </p>
            </div>
            <ul className="flex flex-col gap-6">
              {QUOTES.map((quote) => (
                <li
                  key={quote.attr}
                  className="rounded-r-md border-l-2 border-teal bg-white/[0.04] px-6 py-5"
                >
                  <p className="font-serif text-base leading-relaxed text-bone/80 italic">&ldquo;{quote.text}&rdquo;</p>
                  <p className="mt-3 font-mono text-[0.6875rem] tracking-wider text-bone/30 uppercase">
                    {quote.attr}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </MarketingContainer>
      </section>

      <section id="aegis" className="scroll-mt-28 bg-bone py-20 sm:py-28 lg:py-32">
        <MarketingContainer>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-end lg:gap-16">
            <div>
              <SectionLabel>Aegis — flagship product</SectionLabel>
              <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                Four primitives.
                <br />
                <em className="text-teal not-italic">One guarantee.</em>
              </h2>
            </div>
            <p className="text-base leading-relaxed text-muted">
              Aegis is a verifiable decision record for AI agents and automated systems. Drop in the SDK, and every
              consequential decision your stack makes is recorded to a tamper-evident ledger your auditors and
              regulators can replay end-to-end.
            </p>
          </div>
          <ul className="mt-12 grid border border-parchment bg-parchment sm:grid-cols-2 lg:grid-cols-4">
            {PRIMITIVES.map((p) => (
              <li
                key={p.name}
                className="group relative border-parchment bg-white p-7 transition-colors hover:bg-bone sm:border-r sm:last:border-r-0 lg:border-r lg:last:border-r-0"
              >
                <span className="absolute top-0 right-0 left-0 h-0.5 origin-left scale-x-0 bg-teal transition-transform group-hover:scale-x-100" />
                <span className="font-mono text-[0.625rem] tracking-widest text-gold">{p.num}</span>
                <h3 className="mt-5 font-serif text-2xl text-ink">{p.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.desc}</p>
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </section>

      <section className="bg-white py-20 sm:py-28 lg:py-32">
        <MarketingContainer>
          <SectionLabel>System architecture</SectionLabel>
          <h2 className="mt-4 max-w-2xl font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
            Beside your stack.
            <br />
            Not in front of it.
          </h2>
          <p className="mt-4 max-w-xl text-base text-muted">
            Aegis instruments application code in-process. No traffic proxied. No latency added to the decision path
            beyond the SDK call itself.
          </p>

          <div className="mt-12 overflow-hidden rounded-lg bg-ink p-6 sm:p-10">
            <div className="space-y-8">
              <div>
                <p className="mb-3 font-mono text-[0.625rem] tracking-[0.15em] text-white/25 uppercase">
                  Customer environment
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <ArchBox highlight>Your application</ArchBox>
                  <ArchArrow />
                  <ArchBox highlight>aegis.record()</ArchBox>
                  <ArchArrow />
                  <ArchBox>Local spool · SQLite</ArchBox>
                  <ArchArrow />
                  <ArchBox>Background shipper</ArchBox>
                </div>
              </div>
              <hr className="border-dashed border-white/10" />
              <div>
                <p className="mb-3 font-mono text-[0.625rem] tracking-[0.15em] text-white/25 uppercase">
                  Aegis control plane · HTTPS + Ed25519
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <ArchBox>Ingest API</ArchBox>
                  <ArchArrow />
                  <ArchBox>Ledger Writer</ArchBox>
                  <ArchArrow />
                  <ArchBox>Merkle batch</ArchBox>
                  <ArchArrow />
                  <ArchBox>Anchor Service</ArchBox>
                  <ArchArrow />
                  <ArchBox highlight>Bitcoin · OTS</ArchBox>
                </div>
              </div>
              <hr className="border-dashed border-white/10" />
              <div>
                <p className="mb-3 font-mono text-[0.625rem] tracking-[0.15em] text-white/25 uppercase">Read plane</p>
                <div className="flex flex-wrap items-center gap-3">
                  <ArchBox>Replay Engine</ArchBox>
                  <ArchArrow />
                  <ArchBox>Evidence Pack</ArchBox>
                  <ArchArrow />
                  <ArchBox>Audit API</ArchBox>
                  <ArchArrow />
                  <ArchBox highlight>Regulator · auditor · court</ArchBox>
                </div>
              </div>
            </div>
          </div>

          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {ARCH_FEATURES.map((feat) => (
              <li key={feat.title} className="rounded border border-parchment/80 p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded bg-teal/10">
                  <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem] stroke-teal fill-none" strokeWidth={1.5}>
                    {feat.icon}
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-ink">{feat.title}</h4>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">{feat.desc}</p>
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </section>

      <section className="bg-bone py-20 sm:py-28 lg:py-32">
        <MarketingContainer>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <SectionLabel>SDK design</SectionLabel>
              <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                One import.
                <br />
                <em className="text-teal not-italic">Zero friction.</em>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-muted">
                The SDK is the only surface most engineers will ever see. It feels like Stripe&apos;s, not like a
                compliance product. Sensible defaults. No required infrastructure to call it.
              </p>
              <ul className="mt-8 space-y-4">
                {SDK_PROPS.map((prop) => (
                  <li key={prop.strong} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
                    <p className="text-sm leading-relaxed text-muted">
                      <strong className="font-semibold text-ink">{prop.strong}</strong> {prop.rest}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <SdkCodeTabs />
          </div>
        </MarketingContainer>
      </section>

      <section id="pricing" className="scroll-mt-28 bg-white py-20 sm:py-28 lg:py-32">
        <MarketingContainer>
          <SectionLabel>Pricing &amp; packaging</SectionLabel>
          <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
            Priced on the unit of value.
          </h2>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Per recorded event — a consequential decision you chose to put on the record. Not per seat. Not per data
            volume.
          </p>
          <ul className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <li
                key={plan.name}
                className={`relative rounded-md border p-8 transition-shadow ${
                  plan.featured
                    ? "border-teal bg-teal/[0.03] shadow-[0_0_0_1px_rgba(30,127,118,0.15)]"
                    : "border-parchment hover:border-teal hover:shadow-[0_0_0_1px_rgba(30,127,118,0.15)]"
                }`}
              >
                {plan.featured ? (
                  <span className="absolute top-0 right-6 -translate-y-1/2 rounded-sm bg-teal px-2.5 py-0.5 font-mono text-[0.625rem] tracking-wider text-white uppercase">
                    Recommended
                  </span>
                ) : null}
                <h3 className="font-serif text-2xl text-ink">{plan.name}</h3>
                <p className="mt-2 font-mono text-3xl font-medium text-ink">
                  {plan.price}
                  {plan.priceSuffix ? <span className="text-sm font-normal text-muted">{plan.priceSuffix}</span> : null}
                </p>
                <p className="mt-1 text-sm text-muted">{plan.events}</p>
                <hr className="my-6 border-parchment" />
                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-[0.8125rem] leading-snug text-muted">
                      <span className="mt-0.5 shrink-0 text-teal" aria-hidden>
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </section>

      <section id="standard" className="scroll-mt-28 bg-ink py-20 text-bone sm:py-28 lg:py-32">
        <MarketingContainer>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <SectionLabel>APS-1 — Agent Provenance Standard</SectionLabel>
              <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                An open specification.
                <br />
                <em className="text-teal-soft not-italic">Not our lock-in.</em>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-bone/50">
                APS-1 is Salanor&apos;s published event schema, identity method, and verification procedure — draft{" "}
                <code className="text-bone/70">0.1</code> today, with a path to community review. Any vendor can emit
                APS-1 events. Any auditor can verify them with open-source tooling.
              </p>
              <ul className="mt-8 space-y-4">
                {APS_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-bone/60">
                    <span className="shrink-0 font-mono text-teal-soft" aria-hidden>
                      —
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-8">
                <Link
                  href="/standards"
                  className="font-sans text-sm font-medium text-teal-soft no-underline hover:text-bone"
                >
                  Read the draft schema →
                </Link>
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="flex items-center justify-between border-b border-white/6 bg-white/[0.04] px-5 py-3.5">
                <span className="font-mono text-[0.6875rem] tracking-wider text-white/35">
                  APS-1 canonical event · abridged
                </span>
                <span className="rounded-sm bg-teal/20 px-2 py-0.5 font-mono text-[0.625rem] tracking-wider text-teal-soft">
                  DRAFT 0.1
                </span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-[1.9] text-white/70">
                <span className="text-white/35">{"{"}</span>
                {"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;aps_version&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;0.1&quot;</span>,{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;event_id&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;550e8400-e29b-41d4-a716-446655440000&quot;</span>,{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;recorded_at&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;2026-05-15T11:42:08.221Z&quot;</span>,{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;actor&quot;</span>: {"{ "}
                <span className="text-teal-soft">&quot;type&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;agent&quot;</span>,{" "}
                <span className="text-teal-soft">&quot;id&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;uw-bot-7&quot;</span> {"}"},{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;action&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;underwriting.decline&quot;</span>,{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;subject&quot;</span>: {"{ "}
                <span className="text-teal-soft">&quot;type&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;loan_application&quot;</span>,{" "}
                <span className="text-teal-soft">&quot;id&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;42118&quot;</span> {"}"},{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;context&quot;</span>: {"{ "}
                <span className="text-teal-soft">&quot;inputs&quot;</span>: {"{}"}, {" "}
                <span className="text-teal-soft">&quot;outcome&quot;</span>: {"{}"} {"}"},{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;signature&quot;</span>: {"{ "}
                <span className="text-teal-soft">&quot;alg&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;ed25519&quot;</span>, ... {"}"},{"\n"}
                {"  "}
                <span className="text-teal-soft">&quot;chain&quot;</span>: {"{ "}
                <span className="text-teal-soft">&quot;event_hash&quot;</span>:{" "}
                <span className="text-teal-soft">&quot;sha256:...&quot;</span> {"}"}
                {"\n"}
                <span className="text-white/35">{"}"}</span>
              </pre>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section id="aether" className="scroll-mt-28 bg-bone py-20 sm:py-28 lg:py-32">
        <MarketingContainer>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SectionLabel>Aether — research program</SectionLabel>
              <h2 className="mt-4 font-serif text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                Notes from
                <br />
                <em className="text-teal not-italic">the trust layer.</em>
              </h2>
            </div>
            <p className="max-w-sm text-base text-muted">
              Technical research, essays, and lab notes on accountable autonomy. Published when we have something worth
              defending in front of a room of practitioners.
            </p>
          </div>
          <ul className="mt-12 grid border border-parchment bg-parchment sm:grid-cols-2 lg:grid-cols-4">
            {AETHER_TRACKS.map((track) => (
              <li key={track.title} className="border-parchment bg-white p-8 transition-colors hover:bg-bone">
                <p className="font-mono text-[0.625rem] tracking-widest text-gold uppercase">{track.label}</p>
                <h3 className="mt-4 font-serif text-2xl leading-tight text-ink">{track.title}</h3>
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">{track.desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 font-mono text-[0.8125rem] text-muted">
            Long-form. Slow. Citation-heavy.{" "}
            <Link href="/contact" className="text-teal no-underline hover:underline">
              Subscribe to the research list →
            </Link>
          </p>
        </MarketingContainer>
      </section>

      <section id="contact" className="scroll-mt-28 bg-teal py-16 sm:py-20">
        <MarketingContainer>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-serif text-3xl leading-tight text-white sm:text-4xl">
                If a system acts in the world,
                <br />
                <em className="opacity-75 not-italic">it should be on the record.</em>
              </h2>
              <p className="mt-3 text-base text-white/70">
                Six design partners by end of 2026. One per vertical. Direct line to engineering.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a
                href="mailto:partners@salanor.com"
                className="inline-flex items-center justify-center rounded-sm bg-white px-7 py-3 font-mono text-[0.8125rem] tracking-wide text-teal no-underline transition-opacity hover:opacity-90"
              >
                Become a design partner
              </a>
              <a
                href="mailto:hello@salanor.com"
                className="inline-flex items-center justify-center rounded-sm border border-white/30 px-7 py-3 font-mono text-[0.8125rem] tracking-wide text-white/90 no-underline transition-colors hover:border-white hover:text-white"
              >
                General enquiry
              </a>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </>
  );
}

function ArchBox({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded px-4 py-2.5 font-mono text-[0.6875rem] whitespace-nowrap ${
        highlight
          ? "border border-teal/40 bg-teal/10 text-teal-soft"
          : "border border-white/10 bg-white/[0.04] text-white/70"
      }`}
    >
      {children}
    </span>
  );
}

function ArchArrow() {
  return <span className="font-mono text-xs text-white/20" aria-hidden>→</span>;
}
