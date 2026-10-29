"use client";

import { useEffect, useRef } from "react";

import { SidePanel } from "@/components/console/side-panel";

import styles from "./exports-help-panel.module.css";

const ZIP_FILES = [
  {
    name: "events.ndjson",
    desc: "APS-1 events with hashes and agent signatures (sig_value_b64 / sig_key_id).",
  },
  {
    name: "policies.json",
    desc: "Active policies for your org at export time.",
  },
  {
    name: "approvals.ndjson",
    desc: "Human approval decisions linked to gated actions.",
  },
  {
    name: "audit-log.ndjson",
    desc: "Console audit trail: invites, API keys, membership changes.",
  },
  {
    name: "witness-roots.json",
    desc: "Merkle witness checkpoints for the export window (signed when checkpoint keys are configured).",
  },
  {
    name: "inclusion-proofs.ndjson",
    desc: "Merkle inclusion proofs tying events to witness batches.",
  },
  {
    name: "manifest.json",
    desc: "Artifact list, per-file SHA-256 hashes, and verification summary.",
  },
  {
    name: "README.md",
    desc: "Plain-language purpose, claims, and offline verification steps.",
  },
] as const;

export type ExportHelpSection = "files" | "how";

export function ExportsHelpPanel({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: ExportHelpSection;
  onClose: () => void;
}) {
  const howRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || section !== "how") return;
    const t = window.setTimeout(() => {
      howRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, section]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={section === "how" ? "How exports work" : "What’s in an export?"}
      subtitle={
        section === "how"
          ? "Generation, scheduling, and download."
          : "Evidence packs for auditors and compliance reviews."
      }
    >
      <section className={styles.section} id="export-guide-files">
        <h3 className={styles.sectionTitle}>What’s exported</h3>
        <p className={styles.lead}>
          Each ready row in <strong>Your exports</strong> is a ZIP for the period you chose.
          Download saves it locally. Compare the SHA-256 hash in the table to the whole ZIP; use{" "}
          <code>file_hashes</code> in <code>manifest.json</code> for individual files.
        </p>
        <ul className={styles.fileList}>
          {ZIP_FILES.map((f) => (
            <li key={f.name} className={styles.fileItem}>
              <code>{f.name}</code>
              <p>{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Bundle types</h3>
        <ul className={styles.bundleList}>
          <li>
            <strong>Evidence pack</strong> (recommended): events, policies, approvals,
            witness proofs. No framework “pass/fail” maps.
          </li>
          <li>
            <strong>SOC 2 / EU AI Act / NIST / BNR maps</strong>: draft internal mappings
            only. Do not show to external reviewers until counsel-reviewed.
          </li>
        </ul>
      </section>

      <section className={styles.section} id="export-guide-how" ref={howRef}>
        <h3 className={styles.sectionTitle}>How exports work</h3>
        <p className={styles.lead}>
          <strong>One-time exports</strong> cover the last 30 days. Leave{" "}
          <em>Generate immediately</em> checked so the pack is built right away.
        </p>
        <p className={styles.lead}>
          <strong>Monthly schedule</strong> exports the previous calendar month on the day you
          choose. Production prepares those packs automatically.
        </p>
        <ul className={styles.bundleList}>
          <li>
            <strong>Pending</strong>: preparing; refresh in a minute.
          </li>
          <li>
            <strong>Ready</strong>: download the ZIP; verify with the SHA-256 hash in the table.
          </li>
          <li>
            <strong>Failed</strong>: retry the export; contact support if it keeps failing.
          </li>
        </ul>
      </section>
    </SidePanel>
  );
}
