"use client";

import { useEffect, useRef } from "react";

import { SidePanel } from "@/components/console/side-panel";

import styles from "./exports-help-panel.module.css";

const ZIP_FILES = [
  {
    name: "events.ndjson",
    desc: "Signed APS-1 agent events — tool calls, LLM steps, policy decisions, provenance claims.",
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
    desc: "Console audit trail — invites, API keys, impersonation.",
  },
  {
    name: "witness-roots.json",
    desc: "Transparency log roots for the export window.",
  },
  {
    name: "inclusion-proofs.ndjson",
    desc: "Merkle inclusion proofs tying events to witness batches.",
  },
  {
    name: "control-mapping-soc2.json",
    desc: "SOC 2 trust services criteria mapping (SOC 2 / combined bundles).",
  },
  {
    name: "soc2-type1-report.json",
    desc: "Machine-readable Type I evidence summary (bundle dependent).",
  },
  {
    name: "manifest.json",
    desc: "Artifact list, counts, and integrity metadata.",
  },
  {
    name: "README.md",
    desc: "Offline verification steps for auditors.",
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
          ? "Generation, scheduling, and worker jobs."
          : "Tamper-evident ZIP bundles for auditors and compliance reviews."
      }
    >
      <section className={styles.section} id="export-guide-files">
        <h3 className={styles.sectionTitle}>What’s exported</h3>
        <p className={styles.lead}>
          Each ready row in <strong>Your exports</strong> is a tamper-evident <strong>ZIP</strong> for
          the period you chose. Download saves it locally; compare the SHA-256 hash in the table to
          verify integrity.
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
            <strong>SOC 2</strong> — control mapping for trust services criteria.
          </li>
          <li>
            <strong>EU AI Act</strong> — AI governance artifact set.
          </li>
          <li>
            <strong>Combined</strong> — both (recommended for design partners).
          </li>
        </ul>
      </section>

      <section className={styles.section} id="export-guide-how" ref={howRef}>
        <h3 className={styles.sectionTitle}>How exports work</h3>
        <p className={styles.lead}>
          <strong>One-time exports</strong> cover the last 30 days. With <em>Generate immediately</em>{" "}
          checked, the API builds the ZIP in-process. Uncheck to queue only — useful when the worker
          runs on a schedule.
        </p>
        <p className={styles.lead}>
          <strong>Monthly schedule</strong> exports the previous calendar month on the day you choose
          (UTC). Saving the schedule in the console does not run the job by itself; the server must
          call <code>pnpm compliance:schedule</code> or <code>pnpm compliance:worker</code> daily.
        </p>
        <ul className={styles.bundleList}>
          <li>
            <strong>Pending</strong> — queued; run <code>pnpm compliance:worker</code> on the API
            host.
          </li>
          <li>
            <strong>Ready</strong> — download the ZIP; verify with the SHA-256 hash in the table.
          </li>
          <li>
            <strong>Failed</strong> — check API logs; retry after fixing storage (
            <code>COMPLIANCE_EXPORT_DIR</code>).
          </li>
        </ul>
        <p className={styles.opsNote}>
          <strong>Production cron:</strong> daily <code>pnpm compliance:worker</code> (pending +
          due schedules). Full reference: <code>docs/COMMANDS.md</code> § Compliance exports.
        </p>
      </section>
    </SidePanel>
  );
}
