import Link from "next/link";

import { DataPointField } from "@/components/marketing/data-point-field";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import btn from "@/components/marketing/buttons.module.css";
import { HeroDataVisual } from "@/components/marketing/hero-data-visual";
import { contactUrl, publicVerifyUrl } from "@/lib/site-urls";
import {
  BRAND,
  COMPLIANCE_STRIP,
  FOUNDING_PULL_QUOTE,
  HOW_IT_WORKS,
  INVESTOR_QUOTES,
  PLATFORM_DATA_POINTS,
  PRODUCTS,
} from "@/lib/marketing-content";

import s from "./sections.module.css";

export function HeroSection() {
  return (
    <section className={s.hero}>
      <div className={s.heroGlow} aria-hidden />
      <div className={s.heroLayout}>
        <div className={s.heroCopy}>
          <div className={s.badge}>
            <span className={s.badgeDot} />
            <span>Salanor · design partners 2026</span>
          </div>
          <h1>
            Trust infrastructure for
            <br />
            <span className={s.heroAccent}>agentic systems</span>
          </h1>
          <p className={s.heroTagline}>{BRAND.taglineFull}</p>
          <p className={s.heroSub}>
            Salanor is the platform for provenance, identity, and liability coverage as enterprises
            deploy autonomous agents.{" "}
            <Link href="/products/aegis" style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
              Aegis
            </Link>{" "}
            ships the signed ledger, policy engine, and compliance exports behind APS-1.{" "}
            <Link href="/products/aether" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Aether
            </Link>{" "}
            adds risk intelligence on that ledger in 2027.
          </p>
          <div className={s.heroActions}>
            <a href={contactUrl()} className={s.btnHero}>
              Get access
            </a>
            <Link href="/#how" className={s.btnHeroGhost}>
              How it works
            </Link>
          </div>
          <p className={s.heroNote}>
            Already onboarded? Open <strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Console</strong> in the header.
          </p>
        </div>
        <div>
          <HeroDataVisual />
          <p className={s.heroVisualCaption}>
            Aegis provenance pipeline · shipping 2026
          </p>
        </div>
      </div>
    </section>
  );
}

export function PlatformSection() {
  return (
    <section className={s.section} id="platform">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Platform</p>
          <h2>Infrastructure your diligence team can verify</h2>
          <p>
            Platform primitives shared across Salanor products — provenance, standards, and
            regulatory outputs your diligence team can verify.{" "}
            <Link href={publicVerifyUrl()} className={s.inlineLink}>
              Verify a published event
            </Link>{" "}
            without Salanor credentials.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <DataPointField points={PLATFORM_DATA_POINTS} />
        </ScrollReveal>
      </div>
    </section>
  );
}

export function ProductsTeaserSection() {
  const cards = [PRODUCTS.aegis, PRODUCTS.aether];
  return (
    <section className={s.sectionAlt} id="products">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Products</p>
          <h2>Two products. One trust platform.</h2>
          <p>
            {BRAND.taglineShort} ships first (2026). Aether is intelligence and risk (2027). Same company,
            same ledger.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className={s.teaserGrid}>
            {cards.map((p) => (
              <Link key={p.slug} href={`/products/${p.slug}`} className={s.teaserCard}>
                <span className={s.teaserStatus}>{p.status}</span>
                <p className={s.teaserTag}>{p.tag}</p>
                <h3 className={s.teaserName}>{p.name}</h3>
                <p className={s.teaserDesc}>{p.subhead}</p>
                <span className={s.teaserLink}>Explore {p.name} →</span>
              </Link>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  return (
    <section className={s.section} id="how">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">How it works</p>
          <h2>From agent call to litigation-ready record</h2>
          <p>Four steps. Fully automated. No changes to your agent code.</p>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <div className={s.steps}>
            {HOW_IT_WORKS.map((step) => (
              <article key={step.step}>
                <div className={s.stepNum}>{step.step}</div>
                <h3 className={s.stepTitle}>{step.title}</h3>
                <p className={s.stepDesc}>{step.desc}</p>
              </article>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function InvestorSection() {
  return (
    <section className={s.sectionAlt}>
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Why now</p>
          <h2>The liability gap is the bottleneck to ARR</h2>
          <p>What design partners tell us before they instrument production agents.</p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <div className={s.quotes}>
            {INVESTOR_QUOTES.map((q) => (
              <blockquote key={q.attr} className={s.quote}>
                <p>&ldquo;{q.text}&rdquo;</p>
                <cite>{q.attr}</cite>
              </blockquote>
            ))}
          </div>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <blockquote className={s.foundingPull}>
            <p>&ldquo;{FOUNDING_PULL_QUOTE}&rdquo;</p>
            <footer>
              <cite>The founding note</cite>
              <Link href="/about/founding">Read why Salanor exists →</Link>
            </footer>
          </blockquote>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function ComplianceStripSection() {
  return (
    <section className={s.section}>
      <div className="section-inner">
        <ScrollReveal className={`${s.header} ${s.centerHeader}`}>
          <p className={`section-label ${s.centerLabel}`}>Compliance</p>
          <h2>Regulatory outputs, not slide decks</h2>
          <p>
            Export bundles ship with Aegis at GA; the platform maps the same frameworks across
            products.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <div className={s.complianceRow}>
            {COMPLIANCE_STRIP.map((c) => (
              <div key={c.name} className={s.complianceChip}>
                <strong>{c.name}</strong>
                <span>{c.note}</span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function HomeCtaSection() {
  return (
    <section className={s.section}>
      <div className="section-inner">
        <ScrollReveal>
          <div className={s.ctaBox}>
            <h2>Raising the standard for agentic trust</h2>
            <p>
              We are onboarding a small cohort of design partners and aligned investors for our
              seed extension. Technical diligence calls available weekly.
            </p>
            <div className={s.ctaActions}>
              <Link href="/contact" className={s.btnHero}>
                Talk to the founders →
              </Link>
              <a href="mailto:partners@salanor.com" className={`${btn.btnGhost}`} style={{ padding: "0.875rem 1.75rem", fontSize: "0.9375rem" }}>
                partners@salanor.com
              </a>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function HomePageContent() {
  return (
    <>
      <HeroSection />
      <PlatformSection />
      <ProductsTeaserSection />
      <HowItWorksSection />
      <InvestorSection />
      <ComplianceStripSection />
      <HomeCtaSection />
    </>
  );
}
