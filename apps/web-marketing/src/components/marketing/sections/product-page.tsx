import Link from "next/link";

import { DataPointField } from "@/components/marketing/data-point-field";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { CompanyStack } from "@/components/marketing/company-stack";
import { contactUrl } from "@/lib/site-urls";
import type { PRODUCTS } from "@/lib/marketing-content";

import s from "./product-page.module.css";
import shared from "./sections.module.css";

type Product = (typeof PRODUCTS)[keyof typeof PRODUCTS];

export function ProductPageContent({ product }: { product: Product }) {
  const points = product.metrics.map((m) => ({
    id: m.label,
    value: m.value,
    label: m.label,
    gloss: m.gloss,
    detail: m.detail,
  }));

  return (
    <>
      <section className={s.productHero}>
        <div className={shared.heroGrid} aria-hidden />
        <div className="section-inner">
          <ScrollReveal>
            <Link href="/#products" className={s.back}>
              ← Platform
            </Link>
            <p className="section-label">{product.tag}</p>
            <span className={s.status}>{product.status}</span>
            <h1>{product.headline}</h1>
            {"brandLine" in product && product.brandLine ? (
              <p className={s.brandLine}>{product.brandLine}</p>
            ) : null}
            <p className={s.subhead}>{product.subhead}</p>
            {"legalNote" in product && product.legalNote ? (
              <p className={s.legalNote}>{product.legalNote}</p>
            ) : null}
            <p className={s.desc}>{product.description}</p>
            <div className={shared.heroActions}>
              {product.slug === "aether" ? (
                <a href={contactUrl()} className={shared.btnHero}>
                  Join the waitlist →
                </a>
              ) : (
                <>
                  <Link href="/contact" className={shared.btnHero}>
                    Request design partner access →
                  </Link>
                  <a href="https://github.com/salanor-ltd/salanor" className={shared.btnHeroGhost} target="_blank" rel="noopener noreferrer">
                    View on GitHub
                  </a>
                </>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className={s.stackStrip}>
        <div className="section-inner">
          <ScrollReveal>
            <p className="section-label">Platform</p>
            <h2 className={s.stackTitle}>Where {product.name} sits</h2>
            <CompanyStack
              highlight={product.slug === "aegis" || product.slug === "aether" ? product.slug : undefined}
            />
          </ScrollReveal>
        </div>
      </section>

      <section className={shared.section}>
        <div className="section-inner">
          <ScrollReveal className={shared.header}>
            <p className="section-label">Capabilities</p>
            <h2>What {product.name} delivers</h2>
          </ScrollReveal>
          <ScrollReveal delay={60}>
            <DataPointField points={points} />
          </ScrollReveal>
        </div>
      </section>

      <section className={shared.sectionAlt}>
        <div className="section-inner">
          <ScrollReveal className={shared.header}>
            <p className="section-label">Feature set</p>
            <h2>Shipped scope</h2>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <ul className={s.featureList}>
              {product.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {product.slug === "aegis" && "code" in product ? (
        <section className={shared.section}>
          <div className="section-inner">
            <div className={s.codeLayout}>
              <ScrollReveal>
                <p className="section-label">Developer experience</p>
                <h2>One line. Full provenance.</h2>
                <p className={s.codeBlurb}>
                  <code className={s.inlineCode}>aegis.wrap()</code> instruments your entire agent
                  without touching business logic.
                </p>
                <div className={s.sdkTags}>
                  {["TypeScript", "Python", "Go", "LangGraph", "CrewAI", "MCP"].map((t) => (
                    <span key={t} className={s.sdkTag}>
                      {t}
                    </span>
                  ))}
                </div>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <div className={s.codeWindow}>
                  <div className={s.codeBar}>
                    <span className={s.codeDots} aria-hidden />
                    <span className={s.codeFile}>agent.ts</span>
                  </div>
                  <pre className={s.codePre}>
                    <code>{product.code}</code>
                  </pre>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>
      ) : null}

      {product.compliance.length > 0 ? (
        <section className={shared.sectionAlt} id="compliance">
          <div className="section-inner">
            <ScrollReveal className={`${shared.header} ${shared.centerHeader}`}>
              <p className={`section-label ${shared.centerLabel}`}>Compliance coverage</p>
              <h2>Every regulation. One export.</h2>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <div className={s.complianceGrid}>
                {product.compliance.map((c) => (
                  <div key={c.name} className={s.complianceBadge}>
                    <strong>{c.name}</strong>
                    <span>{c.note}</span>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>
      ) : null}

    </>
  );
}
