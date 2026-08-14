import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";
import {
  AEGIS_PLANS,
  PRICING_COMPARISON_ROWS,
  PRICING_FAQ,
} from "@/lib/pricing-content";

import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Aegis pricing: Free for evaluation, Team at $299/mo for production governance, Enterprise for regulated scale. Per-organization, not per-seat.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Aegis pricing · Salanor",
    description:
      "Three tiers for agent provenance: Free, Team ($299/mo), Enterprise (custom). Events, retention, and compliance exports scale with your program.",
    url: "/pricing",
  },
};

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <span className={styles.check}>Included</span>;
  }
  if (value === false) {
    return <span style={{ color: "var(--text-dim)" }}>-</span>;
  }
  return <>{value}</>;
}

export default function PricingPage() {
  return (
    <MarketingPage
      layout="wide"
      label="Pricing"
      title="Plans that match how teams adopt governance"
      lead="Per organization, not per seat. Start free, upgrade when you need production volume, scheduled exports, or enterprise SSO."
    >
      <div className={styles.grid}>
        {AEGIS_PLANS.map((plan) => (
          <article
            key={plan.slug}
            className={`${styles.card} ${plan.highlighted ? styles.cardHighlight : ""}`}
          >
            <div className={styles.cardHead}>
              <h2 className={styles.planName}>{plan.name}</h2>
              <p className={styles.tagline}>{plan.tagline}</p>
            </div>
            <div className={styles.priceRow}>
              <span className={styles.price}>{plan.priceLabel}</span>
              <span className={styles.priceDetail}>{plan.priceDetail}</span>
            </div>
            <p className={styles.billingNote}>{plan.billingNote}</p>
            <div className={styles.limits}>
              <div>
                <strong>{plan.limits.eventsPerMonth}</strong> events / month
              </div>
              <div>
                {plan.limits.apiKeys} API keys · {plan.limits.members} members ·{" "}
                {plan.limits.retention} retention
              </div>
            </div>
            <ul className={styles.includes}>
              {plan.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link
              href={plan.cta.href}
              className={`${styles.cta} ${plan.highlighted ? styles.ctaPrimary : ""}`}
              {...(plan.cta.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {plan.cta.label}
            </Link>
          </article>
        ))}
      </div>

      <div className={styles.compareWrap}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Team</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {PRICING_COMPARISON_ROWS.map((row) => (
              <tr key={row.feature}>
                <td>{row.feature}</td>
                <td>
                  <CellValue value={row.free} />
                </td>
                <td>
                  <CellValue value={row.team} />
                </td>
                <td>
                  <CellValue value={row.enterprise} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={styles.faq}>
        <h2>Common questions</h2>
        {PRICING_FAQ.map((item) => (
          <div key={item.q} className={styles.faqItem}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>

      <p className={styles.note}>
        Team checkout uses Stripe when configured in production. Until then,{" "}
        <Link href="/contact">contact us</Link> for invoice billing. Platform Ops can
        assign Enterprise limits and record payment without changing your contract
        workflow. See also our{" "}
        <Link href="/trust">trust center</Link> for what is live vs roadmap.
      </p>
    </MarketingPage>
  );
}
