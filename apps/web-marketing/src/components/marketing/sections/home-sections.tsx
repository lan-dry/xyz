import Link from "next/link";

import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { HeroDataVisual } from "@/components/marketing/hero-data-visual";
import {
  COMPLIANCE_AVAILABLE,
  COMPLIANCE_ROADMAP,
  HOME_FAQ,
  HOME_HOW_IT_WORKS,
  HOME_PRICING_BRIEF,
  HOME_PROBLEM_QUESTIONS,
  HOME_SECURITY_HONEST,
  HOME_WHAT_AEGIS_DOES,
  HOME_WHERE_IT_RUNS,
  HOME_WORKFLOW_EXAMPLE,
  IMPLEMENTATION_OFFER,
} from "@/lib/marketing-content";
import { contactUrl } from "@/lib/site-urls";

import s from "./sections.module.css";

export function HeroSection() {
  const offer = IMPLEMENTATION_OFFER;
  return (
    <section className={s.hero}>
      <div className={s.heroGlow} aria-hidden />
      <div className={s.heroLayout}>
        <div className={s.heroCopy}>
          <p className={s.heroBrand}>Aegis by Salanor</p>
          <h1>
            {offer.headline}
            <br />
            <span className={s.heroAccent}>{offer.headlineAccent}</span>
          </h1>
          <p className={s.heroSub}>{offer.subhead}</p>
          <div className={s.heroActions}>
            <a href={contactUrl()} className={s.btnHero}>
              {offer.primaryCta}
            </a>
            <Link href="#example" className={s.btnHeroGhost}>
              {offer.secondaryCta}
            </Link>
          </div>
        </div>
        <div>
          <HeroDataVisual />
          <p className={s.heroVisualCaption}>Rule → record → proof</p>
        </div>
      </div>
    </section>
  );
}

export function ProblemQuestionsSection() {
  return (
    <section className={s.section} id="problem">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">The problem</p>
          <h2>Three questions most teams cannot answer quickly</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <ul className={s.exampleList}>
            {HOME_PROBLEM_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function WhatAegisDoesSection() {
  return (
    <section className={s.sectionAlt} id="what">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">What Aegis does</p>
          <h2>Check, decide, prove</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <div className={s.serviceGrid}>
            {HOME_WHAT_AEGIS_DOES.map((block) => (
              <article key={block.title} className={s.serviceCard}>
                <h3 className={s.stepTitle}>{block.title}</h3>
                <p className={s.stepDesc}>{block.desc}</p>
              </article>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section className={s.section} id="faq">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">FAQ</p>
          <h2>Short answers</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <dl className={s.exampleList}>
            {HOME_FAQ.map((item) => (
              <div key={item.q} style={{ marginBottom: "1.25rem" }}>
                <dt style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{item.q}</dt>
                <dd style={{ margin: 0, opacity: 0.9 }}>{item.a}</dd>
              </div>
            ))}
          </dl>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function WorkflowExampleSection() {
  const ex = HOME_WORKFLOW_EXAMPLE;
  return (
    <section className={s.sectionAlt} id="example">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Concrete</p>
          <h2>{ex.title}</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <ul className={s.exampleList}>
            {ex.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={s.exampleFoot}>{ex.footnote}</p>
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
          <h2>From the action to a record you can show later</h2>
          <p>
            Four steps. Technical terms are explained on the{" "}
            <Link href="/for-engineers" className={s.inlineLink}>
              for engineers
            </Link>{" "}
            page.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <div className={s.serviceGrid}>
            {HOME_HOW_IT_WORKS.map((step) => (
              <article key={step.step} className={s.serviceCard}>
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

export function ComplianceStripSection() {
  return (
    <section className={s.sectionAlt}>
      <div className="section-inner">
        <ScrollReveal className={`${s.header} ${s.centerHeader}`}>
          <p className={`section-label ${s.centerLabel}`}>Trust</p>
          <h2>Evidence for audit, not slide decks</h2>
          <p>
            Export bundles map to frameworks we support today. See{" "}
            <Link href="/trust" className={s.inlineLink}>
              trust center
            </Link>{" "}
            for live status. Mapping is not certification.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <p className={s.complianceGroupLabel}>Available in exports today</p>
          <div className={s.complianceRow}>
            {COMPLIANCE_AVAILABLE.map((c) => (
              <div key={c.name} className={s.complianceChip}>
                <strong>{c.name}</strong>
                <span>{c.note}</span>
              </div>
            ))}
          </div>
          <p className={s.complianceGroupLabel}>Roadmap</p>
          <div className={s.complianceRow}>
            {COMPLIANCE_ROADMAP.map((c) => (
              <div key={c.name} className={`${s.complianceChip} ${s.complianceChipMuted}`}>
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

export function WhereItRunsSection() {
  return (
    <section className={s.section} id="where">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Where it runs</p>
          <h2>Your cloud or ours</h2>
          <p>{HOME_WHERE_IT_RUNS}</p>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function SecurityHonestSection() {
  const sec = HOME_SECURITY_HONEST;
  return (
    <section className={s.sectionAlt} id="security">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Security</p>
          <h2>{sec.title}</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <ul className={s.exampleList}>
            <li>
              <strong>Stored.</strong> {sec.stored}
            </li>
            <li>
              <strong>Signed.</strong> {sec.signed}
            </li>
            <li>
              <strong>Not yet.</strong> {sec.notYet}
            </li>
          </ul>
          <p className={s.exampleFoot}>
            Full detail on the{" "}
            <Link href="/legal/security" className={s.inlineLink}>
              security page
            </Link>
            .
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function PricingBriefSection() {
  const p = HOME_PRICING_BRIEF;
  return (
    <section className={s.section} id="pricing-brief">
      <div className="section-inner">
        <ScrollReveal className={s.header}>
          <p className="section-label">Pricing</p>
          <h2>{p.title}</h2>
        </ScrollReveal>
        <ScrollReveal delay={60}>
          <ul className={s.exampleList}>
            {p.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={s.exampleFoot}>
            <Link href={p.href} className={s.inlineLink}>
              Full pricing page
            </Link>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function ContactActionSection() {
  return (
    <section className={s.sectionAlt} id="contact">
      <div className="section-inner">
        <ScrollReveal className={`${s.header} ${s.centerHeader}`}>
          <p className={`section-label ${s.centerLabel}`}>Contact</p>
          <h2>One next step</h2>
          <p>Tell us the workflow you want to govern. We will reply with a short scoping plan.</p>
          <p style={{ marginTop: "1.25rem" }}>
            <a href={contactUrl()} className={s.btnHero}>
              Talk to us
            </a>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function HomePageContent() {
  return (
    <>
      <HeroSection />
      <ProblemQuestionsSection />
      <WhatAegisDoesSection />
      <HowItWorksSection />
      <WorkflowExampleSection />
      <WhereItRunsSection />
      <SecurityHonestSection />
      <PricingBriefSection />
      <ComplianceStripSection />
      <FaqSection />
      <ContactActionSection />
    </>
  );
}
