"use client";

import { Eye, EyeOff, FileText, Paperclip, ShieldCheck } from "lucide-react";
import { useState } from "react";

import {
  HighlightedUpstream,
} from "@/components/message-privacy";
import type { MessageAttachment } from "@/lib/stoa-client";
import { fetchAttachmentProtected } from "@/lib/stoa-client";

import privacyStyles from "./message-privacy.module.css";
import styles from "./attachment-protected.module.css";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentProtectedChip({
  attachment,
  providerLabel,
  compact,
}: {
  attachment: MessageAttachment;
  providerLabel: string;
  /** Pending composer chip — slightly denser. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extract, setExtract] = useState<string | null>(
    attachment.textExtract ?? null,
  );
  const [scanDetail, setScanDetail] = useState<string | null>(
    attachment.scanDetail ?? null,
  );
  const [hasPreview, setHasPreview] = useState(
    Boolean(attachment.hasRedactedPreview),
  );

  async function ensurePayload() {
    if (extract?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttachmentProtected(attachment.id);
      setExtract(data.textExtract);
      setScanDetail(data.scanDetail);
      setHasPreview(data.hasRedactedPreview);
      if (!data.textExtract?.trim()) {
        setError("No protected extract is available for this file.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await ensurePayload();
    }
  }

  return (
    <div className={compact ? styles.wrapCompact : styles.wrap}>
      <div className={styles.chipRow}>
        <span className={styles.fileChip}>
          <Paperclip size={12} aria-hidden />
          <span className={styles.fileName}>{attachment.originalName}</span>
          <span className={styles.fileMeta}>{formatSize(attachment.byteSize)}</span>
        </span>
        <button
          type="button"
          className={privacyStyles.chip}
          onClick={() => void toggle()}
          aria-expanded={open}
          title="Show what the AI receives from this file"
        >
          <ShieldCheck size={13} aria-hidden />
          <span>What the model sees</span>
          {open ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
        </button>
      </div>

      {open ? (
        <div className={privacyStyles.proof}>
          <p className={privacyStyles.proofTitle}>
            Protected payload for {providerLabel}
          </p>
          <p className={styles.lead}>
            The original file never leaves your organization. Only this redacted
            text is sent to the model
            {hasPreview ? " (cleaned image preview is stored locally)" : ""}.
          </p>
          {scanDetail ? (
            <p className={styles.scanDetail}>{scanDetail}</p>
          ) : null}
          {loading ? (
            <p className={styles.muted}>Loading protected extract…</p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {extract?.trim() ? (
            <div className={privacyStyles.proofBody}>
              <HighlightedUpstream text={extract} />
            </div>
          ) : null}
          {hasPreview && !loading ? (
            <div className={styles.previewBlock}>
              <p className={styles.previewLabel}>
                <FileText size={12} aria-hidden />
                Cleaned preview (black boxes over sensitive regions)
              </p>
              <img
                className={styles.previewImg}
                src={`/api/stoa/attachments/${attachment.id}/redacted-preview`}
                alt="Protected preview with sensitive regions covered"
              />
            </div>
          ) : null}
          <p className={privacyStyles.proofFoot}>
            Placeholders like [EMAIL_WITHHELD] are what the provider sees — not
            your real values.
          </p>
        </div>
      ) : null}
    </div>
  );
}
