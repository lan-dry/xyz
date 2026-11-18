"use client";

import type { CaseProvenance, FieldAssertionKind } from "@/lib/types";
import { ui } from "@/components/console/console-ui";

const ASSERTION_WORDS: Record<FieldAssertionKind, string> = {
  asserted_by_source: "The source's own claim",
  derived_by_aegis: "Worked out or recorded by Aegis",
  corroborated: "Corroborated by another record",
  independently_captured: "Captured independently of the source",
};

const AUTH_WORDS: Record<string, string> = {
  bearer_key: "Ingest key (the sender did not sign the data)",
  source_signature: "Signed by the source system",
  mtls: "Mutually authenticated connection (mTLS)",
};

/**
 * Two separate answers, never one green "verified":
 *  1. Record intact: signed and unchanged since <time>   (about the record)
 *  2. Source of the data: <grade and plain wording>       (about where the data came from)
 *
 * `recordIntact` is null while the seal check is unknown; false when it failed.
 */
export function RecordAndSourceLines({
  provenance,
  recordIntact,
  fallbackSourceLine = "Source of the data: not labelled for this case. Aegis does not check that the data is accurate.",
}: {
  provenance: CaseProvenance | null | undefined;
  recordIntact: boolean | null;
  fallbackSourceLine?: string;
}) {
  const recordLine =
    recordIntact === false
      ? "Record check failed: it may have been changed after signing. Open Technical details."
      : recordIntact === null
        ? "Record check: not available yet."
        : (provenance?.record_line ?? "Record intact: signed and unchanged since it was sealed");
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem" }}>
      <li style={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>{recordLine}</li>
      <li style={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
        {provenance?.source_line ?? fallbackSourceLine}
      </li>
    </ul>
  );
}

/** Case page panel: where the data came from, five-fact checklist, details behind a toggle. */
export function ProvenancePanel({
  provenance,
  title = "Where this data came from",
}: {
  provenance: CaseProvenance | null | undefined;
  title?: string;
}) {
  if (!provenance) return null;
  const risen = provenance.current_grade !== provenance.grade_at_seal;
  return (
    <section
      className={`${ui.card} ${ui.cardPad}`}
      style={{ marginBottom: "1.5rem" }}
      aria-labelledby="provenance-heading"
    >
      <h2 id="provenance-heading" className={ui.panelTitle}>
        {title}
      </h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem", lineHeight: 1.55 }}>
        {provenance.headline}
      </p>
      <ul style={{ margin: "0 0 0.75rem", padding: 0, listStyle: "none", display: "grid", gap: "0.3rem" }}>
        {provenance.checklist.map((item) => (
          <li
            key={item.id}
            style={{
              fontSize: "0.875rem",
              color: item.met ? "inherit" : "var(--console-fg-muted)",
              display: "flex",
              gap: "0.5rem",
            }}
          >
            <span aria-hidden style={{ width: "1.1rem", flex: "none" }}>
              {item.met ? "✓" : "–"}
            </span>
            <span>
              {item.label}
              <span style={{ color: "var(--console-fg-subtle)" }}>
                {item.met ? " · yes" : " · no"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        Grade now: <strong>{provenance.current_grade}</strong>
        {risen ? (
          <>
            {" "}
            (it was {provenance.grade_at_seal} when sealed; each rise is a signed record)
          </>
        ) : null}
        .
      </p>
      {provenance.grade_changes.length > 0 ? (
        <ul style={{ margin: "0 0 0.5rem", paddingLeft: "1.1rem", fontSize: "0.8125rem" }}>
          {provenance.grade_changes.map((c) => (
            <li key={c.receipt_id}>
              {c.from_grade} to {c.to_grade}
              {c.feed_name ? ` (${c.feed_name})` : ""}: {c.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        {provenance.limitations}
      </p>
      <details style={{ marginTop: "0.75rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.8125rem" }}>Technical details</summary>
        <dl
          style={{
            margin: "0.5rem 0 0",
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "0.2rem 0.75rem",
            fontSize: "0.8125rem",
          }}
        >
          {provenance.source ? (
            <>
              <dt style={{ color: "var(--console-fg-muted)" }}>Source id</dt>
              <dd className="mono" style={{ margin: 0 }}>
                {provenance.source.source_id}
              </dd>
              <dt style={{ color: "var(--console-fg-muted)" }}>How it was authenticated</dt>
              <dd style={{ margin: 0 }}>
                {AUTH_WORDS[provenance.source.authentication] ?? provenance.source.authentication}
              </dd>
              {provenance.source.key_id ? (
                <>
                  <dt style={{ color: "var(--console-fg-muted)" }}>Source key</dt>
                  <dd className="mono" style={{ margin: 0 }}>
                    {provenance.source.key_id}
                  </dd>
                </>
              ) : null}
            </>
          ) : null}
          <dt style={{ color: "var(--console-fg-muted)" }}>Grade at seal</dt>
          <dd style={{ margin: 0 }}>{provenance.grade_at_seal}</dd>
          <dt style={{ color: "var(--console-fg-muted)" }}>Recorded by Aegis at</dt>
          <dd className="mono" style={{ margin: 0 }}>
            {provenance.recorded_at ?? "not recorded (sealed before labelling)"}
          </dd>
        </dl>
        {Object.keys(provenance.field_assertions).length > 0 ? (
          <table className={ui.table} style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr>
                <th>Field</th>
                <th>Who says so</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(provenance.field_assertions).map(([field, how]) => (
                <tr key={field}>
                  <td className="mono">{field}</td>
                  <td>{ASSERTION_WORDS[how] ?? how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </section>
  );
}
