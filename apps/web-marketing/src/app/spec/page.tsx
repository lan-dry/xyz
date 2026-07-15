import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { BRAND } from "@/lib/marketing-content";
import { docsUrl } from "@/lib/site-urls";

import styles from "./spec.module.css";

export const metadata: Metadata = {
  title: "Open specifications",
  description:
    "APS-1 (Agent Provenance Standard) and did:agent — Salanor open specifications for verifiable agent actions.",
};

export default function SpecPage() {
  return (
    <MarketingPage
      layout="wide"
      label="Open specifications"
      title="Standards for verifiable agent actions"
      lead={`${BRAND.taglineFull} Salanor publishes machine-readable contracts so builders, auditors, and regulators can verify agent behavior without trusting a single vendor UI.`}
    >
      <div className={styles.grid}>
        <section className={styles.card} id="aps-1">
        <p className={styles.badge}>APS-1 · version 0.1</p>
        <h2>Agent Provenance Standard (APS-1)</h2>
        <p>
          APS-1 defines a signed JSON event envelope for consequential agent actions: tool calls,
          model invocations, policy decisions, human approvals, and trace spans. Events are
          canonicalized (JCS), signed with Ed25519, chained per trace, and anchored for third-party
          verification.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Wire format</strong> — stable field names (<code>schema_version</code>,{" "}
            <code>trace_id</code>, <code>action_kind</code>, …) independent of product branding.
          </li>
          <li>
            <strong>Signing</strong> — digest over canonical JSON; <code>sig_alg</code> +{" "}
            <code>sig_value_b64</code> on the event.
          </li>
          <li>
            <strong>Policy surface</strong> — <code>policy_decision</code> and optional{" "}
            <code>policy_id</code> for allow / deny / obligation semantics.
          </li>
          <li>
            <strong>Interop</strong> — TypeScript reference SDK, JSON Schema, and conformance
            vectors; publishable as a standalone open-source package.
          </li>
        </ul>
        <div className={styles.actions}>
          <a
            href="https://github.com/salanor/salanor/blob/main/spec/aps/v0.1.json"
            className={styles.primary}
            rel="noopener noreferrer"
            target="_blank"
          >
            JSON Schema
          </a>
          <Link href={docsUrl("aegis")} className={styles.ghost}>
            Aegis developer docs
          </Link>
        </div>
      </section>

      <section className={styles.card} id="did-agent">
        <p className={styles.badge}>Identity · version 0.1</p>
        <h2><code>did:agent</code></h2>
        <p>
          <code>did:agent</code> identifies autonomous software actors in a tenant namespace.
          Salanor resolves DIDs to signing keys, policy scope, and console metadata. Each
          organization owns a namespace; each deployed agent receives a stable DID and rotatable
          keys.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Format</strong> — <code>did:agent:&lt;org&gt;:&lt;agent-slug&gt;</code>
          </li>
          <li>
            <strong>Binding</strong> — APS-1 events reference <code>agent_id</code> and{" "}
            <code>key_id</code> tied to the DID document.
          </li>
          <li>
            <strong>Rotation</strong> — new Ed25519 keys without changing the logical agent DID.
          </li>
        </ul>
        <div className={styles.actions}>
          <Link href={docsUrl("aegis")} className={styles.ghost}>
            Implementation guide
          </Link>
        </div>
      </section>

      </div>

      <section className={styles.status}>
        <h2>Specification index</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Document</th>
              <th>Version</th>
              <th>License</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>APS-1 event envelope</td>
              <td>0.1 (published)</td>
              <td>Apache-2.0</td>
            </tr>
            <tr>
              <td><code>did:agent</code> method</td>
              <td>0.1 (published)</td>
              <td>Apache-2.0</td>
            </tr>
            <tr>
              <td>Transparency / inclusion proofs</td>
              <td>Appendix (Aegis product)</td>
              <td>Apache-2.0</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note}>
          Implementer feedback:{" "}
          <a href="mailto:standards@salanor.com">standards@salanor.com</a> or the{" "}
          <Link href="/contact">contact form</Link> (topic: design partner).
        </p>
      </section>
    </MarketingPage>
  );
}
