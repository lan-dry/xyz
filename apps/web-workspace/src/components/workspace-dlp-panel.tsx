"use client";

import { Shield, X } from "lucide-react";

import type { SessionInfo } from "@/lib/stoa-client";

import styles from "./workspace-dlp-panel.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  dlp: NonNullable<SessionInfo["workspaceDlp"]>;
};

export function WorkspaceDlpPanel({ open, onClose, dlp }: Props) {
  if (!open) {
    return null;
  }
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-labelledby="dlp-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Shield size={18} aria-hidden />
            <h2 id="dlp-panel-title">What stays private</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            <X size={18} aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </header>
        <div className={styles.block}>
          <ul className={styles.list}>
            {dlp.categories.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
          {dlp.customTermCount > 0 ? (
            <p className={styles.muted}>
              Also hidden: {dlp.customTermCount} confidential word
              {dlp.customTermCount === 1 ? "" : "s"} set by your organization.
            </p>
          ) : null}
        </div>
        <p className={styles.footer}>
          Private details are replaced with placeholders like{" "}
          <code>[EMAIL_1]</code> before sending, then put back in the reply.
        </p>
      </aside>
    </div>
  );
}
