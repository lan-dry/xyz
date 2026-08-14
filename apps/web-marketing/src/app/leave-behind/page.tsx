import type { Metadata } from "next";
import Link from "next/link";

import { PLAN_DISPLAY_LIST } from "@salanor/plan-display";
import { BRAND } from "@/lib/marketing-content";
import { SITE_ORIGIN } from "@/lib/site-origin";

import { PrintToolbar } from "./print-toolbar";
import styles from "./leave-behind.module.css";

export const metadata: Metadata = {
  title: "Aegis leave-behind",
  description: "One-page Salanor Aegis overview for prospects. Print or save as PDF.",
  robots: { index: false, follow: false },
};

export default function LeaveBehindPage() {
  return (
    <div className={styles.page} data-marketing-shell>
      <PrintToolbar backHref="/products/aegis" />

      <article className={styles.sheet}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Salanor</p>
          <h1>Aegis: signed provenance for agent actions</h1>
          <p className={styles.tagline}>{BRAND.taglineFull}</p>
        </header>

        <section>
          <h2>The problem</h2>
          <p>
            When an AI agent publishes content, moves money, or changes production data, most teams
            cannot answer: who authorized it, with what policy, and can you prove it to an auditor?
          </p>
        </section>

        <section>
          <h2>What Aegis does</h2>
          <ul>
            <li>Policy gate before risky tools run (allow, deny, require approval)</li>
            <li>Ed25519 signed APS-1 events in an append-only ledger</li>
            <li>Human approvals with named approver and expiry</li>
            <li>Trace replay and cryptographic verify (chain + Merkle inclusion)</li>
            <li>Compliance export bundles (SOC 2 / EU AI Act control mapping)</li>
            <li>n8n Workflow Bridge, TypeScript / Python / Go SDKs</li>
          </ul>
        </section>

        <section>
          <h2>Plans (per organization)</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Events / mo</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_DISPLAY_LIST.map((p) => (
                <tr key={p.slug}>
                  <td>{p.name}</td>
                  <td>
                    {p.listPrice} {p.listPriceDetail}
                  </td>
                  <td>{p.limits.eventsPerMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.links}>
            Full detail:{" "}
            <Link href="/pricing">{SITE_ORIGIN}/pricing</Link>
          </p>
        </section>

        <section>
          <h2>Honest status</h2>
          <p>
            Design-partner pilot in 2026. Live: ingest, policy, approvals, witness batches, exports,
            n8n bridge. Roadmap: Salanor SOC 2 Type II (target Q4 2026), FedRAMP path (Q2 2027).
          </p>
          <p className={styles.links}>
            Trust center: <Link href="/trust">{SITE_ORIGIN}/trust</Link>
          </p>
        </section>

        <section>
          <h2>Next step</h2>
          <p>
            Book a 30-minute demo or start free at{" "}
            <a href="https://app.salanor.com/signup">app.salanor.com/signup</a>. Contact:{" "}
            <Link href="/contact">{SITE_ORIGIN}/contact</Link>
          </p>
        </section>

        <footer className={styles.footer}>
          <p>Salanor Ltd · {SITE_ORIGIN}</p>
        </footer>
      </article>
    </div>
  );
}
