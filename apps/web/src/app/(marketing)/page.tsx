import type { Metadata } from "next";
import Link from "next/link";

import { AegisCodeWindow } from "@/components/marketing/aegis-code-window";
import { HomeMarketingSections } from "@/components/marketing/home-marketing-sections";
import { marketingInkCtaClass } from "@/components/marketing-cta";

export const metadata: Metadata = {
  title: "Salanor",
  description:
    "The trust layer for systems that act — verifiable, auditable, contestable decisions for autonomous and AI-driven systems.",
};

const STATS = [
  { value: "<1.5ms", label: "Hot path p99 target", note: "design target" },
  { value: "250ms", label: "Merkle batch window", note: "ledger default" },
  { value: "~0.1ms", label: "SDK record (local)", note: "P0 bench, indicative" },
  { value: "4", label: "Decision primitives", note: "capture · anchor · replay · export" },
  { value: "Per-tenant", label: "Hard isolation", note: "console data plane" },
] as const;

const PRODUCT_LINES = [
  {
    name: "Aegis",
    badge: "ACTIVE",
    badgeClass: "bg-teal-active text-bone",
    vanityLabel: "aegis.salanor.com",
    href: "/aegis",
    description:
      "A verifiable decision record for AI agents and automated systems. SDK-first, ledger-backed, replayable end-to-end.",
  },
  {
    name: "Aether",
    badge: "PROGRAM",
    badgeClass: "bg-gold-program text-ink",
    vanityLabel: "salanor.com/aether",
    href: "/aether",
    description:
      "Our research program on accountable autonomy, agent provenance, and the policy questions before deployment.",
  },
] as const;

const ctaBase =
  "inline-flex items-center justify-center rounded px-5 py-2.5 text-sm font-medium no-underline transition-colors";

export default function Page() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      <section
        aria-labelledby="home-hero-heading"
        className="marketing-fade-in pt-8 pb-12 lg:grid lg:grid-cols-2 lg:items-start lg:gap-12 lg:pb-16 lg:pt-12"
      >
        <div className="lg:pr-4">
          <p className="text-xs font-medium tracking-[0.2em] text-ink/60 uppercase">
            — Infrastructure · Trust layer · 2026
          </p>
          <h1
            id="home-hero-heading"
            className="mt-4 font-serif text-4xl leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]"
          >
            The trust layer for systems that act.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/85">
            Salanor builds the infrastructure that makes autonomous and AI-driven decisions verifiable, auditable, and
            contestable — wherever software acts on behalf of people and institutions.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/aegis" className={`${ctaBase} ${marketingInkCtaClass}`}>
              Explore our work
            </Link>
            <Link
              href="/contact"
              className={`${ctaBase} border border-ink/25 text-ink hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal`}
            >
              Talk to us
            </Link>
          </div>
        </div>

        <div className="marketing-fade-in-delayed mt-10 lg:mt-0 lg:justify-self-end">
          <AegisCodeWindow />
        </div>
      </section>

      <section aria-label="Platform metrics" className="marketing-fade-in border-t border-ink/15 py-10 lg:py-12">
        <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
          {STATS.map((stat) => (
            <li key={stat.label} className="text-center lg:text-left">
              <p className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-ink/80">{stat.label}</p>
              <p className="mt-0.5 text-xs text-ink/50">{stat.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="products" className="scroll-mt-28 pt-16 lg:pt-20" aria-labelledby="products-heading">
        <h2 id="products-heading" className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          Two product lines. One philosophy.
        </h2>
        <p className="mt-4 max-w-2xl font-sans text-ink/70">
          Evidence, human accountability, and honest status labels — built for domains where being wrong has
          consequences.
        </p>

        <div
          className="mt-10 rounded-2xl bg-parchment px-8 py-7 sm:px-10 sm:py-8"
          aria-labelledby="aps-standard-heading"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="aps-standard-heading" className="font-serif text-2xl tracking-tight text-ink sm:text-[1.75rem]">
              APS-1 · Agent Provenance Standard
            </h3>
            <span className="rounded-full bg-ink/12 px-3 py-1 font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-ink/55 uppercase">
              Standards
            </span>
          </div>
          <p className="mt-3 max-w-3xl font-sans text-sm leading-relaxed text-muted sm:text-[0.9375rem]">
            The public wire format for verifiable agent decisions — who acted, on what, with what context, plus
            signatures and a hash chain. Aegis records, validates, and replays events that conform to APS-1 draft{" "}
            <code className="text-ink/80">0.1</code>.
          </p>
          <p className="mt-5">
            <Link
              href="/standards"
              className="font-sans text-sm font-medium text-ink/75 no-underline transition-colors hover:text-teal-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-active"
            >
              salanor.com/standards →
            </Link>
          </p>
        </div>

        <ul className="mt-6 grid gap-6 md:grid-cols-2 md:gap-8">
          {PRODUCT_LINES.map((product) => (
            <li key={product.name}>
              <Link
                href={product.href}
                className="group flex h-full flex-col rounded-2xl bg-parchment px-8 py-8 no-underline transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-active sm:px-10 sm:py-10"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <h3 className="font-serif text-4xl tracking-tight text-ink sm:text-[2.75rem] sm:leading-none">
                    {product.name}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 font-sans text-[0.6875rem] font-semibold tracking-[0.12em] uppercase ${product.badgeClass}`}
                  >
                    {product.badge}
                  </span>
                </div>
                <p className="mt-5 flex-1 font-sans text-sm leading-relaxed text-muted sm:text-[0.9375rem]">
                  {product.description}
                </p>
                <span className="mt-8 font-sans text-sm font-medium text-ink/75 group-hover:text-teal-active">
                  {product.vanityLabel} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      </div>

      <HomeMarketingSections />
    </>
  );
}