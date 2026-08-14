import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { TRUST_FEATURES, TRUST_STATUS_LABEL } from "@/lib/trust-content";

import styles from "./trust.module.css";

export const metadata: Metadata = {
  title: "Trust & status",
  description:
    "What is live in the Salanor Aegis design-partner pilot vs roadmap. BYOK, witness cadence, compliance exports, and integrations.",
  alternates: { canonical: "/trust" },
};

export default function TrustPage() {
  const live = TRUST_FEATURES.filter((f) => f.status === "live").length;
  const pilot = TRUST_FEATURES.filter((f) => f.status === "pilot").length;

  return (
    <MarketingPage
      layout="wide"
      label="Trust"
      title="Platform status"
      lead="Honest view of what works in production today for design partners. Updated with each release."
    >
      <p className={styles.summary}>
        <strong>{live}</strong> capabilities live · <strong>{pilot}</strong> in pilot ·{" "}
        remainder on roadmap.{" "}
        <Link href="/legal/security">Security whitepaper</Link> ·{" "}
        <Link href="/legal/fedramp">FedRAMP path</Link>
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {TRUST_FEATURES.map((row) => (
              <tr key={row.id}>
                <td>{row.feature}</td>
                <td>
                  <span className={`${styles.badge} ${styles[`badge_${row.status}`]}`}>
                    {TRUST_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={styles.ops}>
        <h2>Production ops checklist</h2>
        <ul>
          <li>
            <code>pnpm witness:worker</code>: Merkle batches every 60s (
            <code>WITNESS_INTERVAL_MS</code>)
          </li>
          <li>
            <code>pnpm compliance:worker</code>: daily pending exports + monthly schedules
          </li>
          <li>
            <code>pnpm maintenance:housekeeping</code>: hourly approval expiry + stale traces
          </li>
          <li>
            <code>COMPLIANCE_EXPORT_DIR</code>: persistent volume for export ZIPs
          </li>
          <li>
            <code>AEGIS_SIGNING_KEY_FILE</code> or customer KMS ARN for server-side signing paths
          </li>
        </ul>
      </section>
    </MarketingPage>
  );
}
