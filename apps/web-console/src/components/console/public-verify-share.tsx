"use client";

import { Copy, ExternalLink, Link2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import {
  buildPublicVerifyCliCommand,
  buildPublicVerifyUrl,
} from "@/lib/public-verify";

type Props = {
  organizationSlug: string;
  eventId: string;
  /** Shorter copy for inline panels */
  compact?: boolean;
};

type ShareCreated = {
  share: {
    share_id: string;
    expires_at: string;
    hours: number;
    share_url: string;
    token: string;
  };
};

const HOUR_OPTIONS = [
  { value: 24, label: "24 hours" },
  { value: 72, label: "3 days" },
  { value: 168, label: "7 days" },
  { value: 720, label: "30 days" },
] as const;

export function PublicVerifyShare({
  organizationSlug,
  eventId,
  compact = false,
}: Props) {
  const [copied, setCopied] = useState<"share" | "verify" | "cli" | null>(null);
  const [hours, setHours] = useState<number>(72);
  const [created, setCreated] = useState<ShareCreated["share"] | null>(null);
  const verifyUrl = buildPublicVerifyUrl(organizationSlug, eventId);
  const cli = buildPublicVerifyCliCommand(organizationSlug, eventId);

  const createShare = useMutation({
    mutationFn: () =>
      consoleApi<ShareCreated>(`/events/${encodeURIComponent(eventId)}/share`, {
        method: "POST",
        body: JSON.stringify({ hours }),
      }),
    onSuccess: (data) => {
      // Prefer this console origin so local share links never point at a stale API env port.
      let shareUrl = data.share.share_url;
      try {
        const parsed = new URL(data.share.share_url);
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        shareUrl = `${window.location.origin}${path}`;
      } catch {
        /* keep API URL */
      }
      setCreated({ ...data.share, share_url: shareUrl });
    },
  });

  async function copy(text: string, kind: "share" | "verify" | "cli") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      className={`${ui.card} ${ui.cardPad} ${ui.panel}`}
      style={{ marginBottom: compact ? 0 : "1.5rem" }}
      aria-labelledby="share-receipt-heading"
    >
      <h2 id="share-receipt-heading" className={ui.panelTitle}>
        Share receipt
      </h2>
      <p
        style={{
          margin: "0 0 1rem",
          fontSize: "0.875rem",
          color: "var(--console-fg-subtle)",
        }}
      >
        Create a read-only link that opens this sealed receipt without Console access.
        The link expires automatically; revoke from audit if needed.
      </p>

      <div
        className={ui.formRow}
        style={{ marginBottom: "0.75rem", alignItems: "center" }}
      >
        <label className={ui.field} style={{ margin: 0, minWidth: "10rem" }}>
          <select
            className={ui.select}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            aria-label="Share link lifetime"
          >
            {HOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Expires in {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => createShare.mutate()}
          disabled={createShare.isPending}
          aria-busy={createShare.isPending}
        >
          <Link2 size={14} aria-hidden />
          {createShare.isPending ? "Creating…" : "Create share link"}
        </button>
      </div>

      {createShare.error ? (
        <p
          role="alert"
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.8125rem",
            color: "var(--console-danger)",
          }}
        >
          {(createShare.error as Error).message}
        </p>
      ) : null}

      {created ? (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            background: "var(--console-bg-subtle)",
            borderRadius: "6px",
            border: "1px solid var(--console-border)",
          }}
        >
          <p
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--console-fg-subtle)",
            }}
          >
            Expiring share link · valid until{" "}
            {new Date(created.expires_at).toLocaleString()}
          </p>
          <p
            className="mono"
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.8125rem",
              wordBreak: "break-all",
            }}
          >
            {created.share_url}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => void copy(created.share_url, "share")}
            >
              <Copy size={14} aria-hidden />
              {copied === "share" ? "Copied" : "Copy share link"}
            </button>
            <a
              href={created.share_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ui.btn} ${ui.btnSecondary}`}
            >
              <ExternalLink size={14} aria-hidden />
              Open share
            </a>
          </div>
        </div>
      ) : null}

      <details>
        <summary
          style={{
            cursor: "pointer",
            fontSize: "0.8125rem",
            color: "var(--console-fg-muted)",
          }}
        >
          Permanent public Verify (no expiry)
        </summary>
        <p
          style={{
            margin: "0.75rem 0",
            fontSize: "0.8125rem",
            color: "var(--console-fg-subtle)",
          }}
        >
          Anyone with org slug + event ID can confirm witness inclusion. Prefer an
          expiring share link when sending to third parties.
        </p>
        <div
          className="mono"
          style={{
            fontSize: "0.75rem",
            wordBreak: "break-all",
            padding: "0.75rem",
            background: "var(--console-bg-subtle)",
            borderRadius: "6px",
            marginBottom: "0.75rem",
          }}
        >
          {verifyUrl}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            onClick={() => void copy(verifyUrl, "verify")}
          >
            {copied === "verify" ? "Copied" : "Copy Verify link"}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            onClick={() => void copy(cli, "cli")}
          >
            {copied === "cli" ? "CLI copied" : "Copy CLI"}
          </button>
        </div>
      </details>
    </div>
  );
}
