"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

import { ui } from "@/components/console/console-ui";
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

export function PublicVerifyShare({
  organizationSlug,
  eventId,
  compact = false,
}: Props) {
  const [copied, setCopied] = useState<"link" | "cli" | null>(null);
  const verifyUrl = buildPublicVerifyUrl(organizationSlug, eventId);
  const cli = buildPublicVerifyCliCommand(organizationSlug, eventId);

  async function copy(text: string, kind: "link" | "cli") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      className={`${ui.card} ${ui.cardPad} ${ui.panel}`}
      style={{ marginBottom: compact ? 0 : "1.5rem" }}
    >
      <h2 className={ui.panelTitle}>Public verification link</h2>
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--console-fg-subtle)" }}>
        Share with auditors, customers, or regulators. They can confirm witness and
        transparency inclusion without a Salanor login.
      </p>
      <div
        className="mono"
        style={{
          fontSize: "0.8125rem",
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
          className={`${ui.btn} ${ui.btnSecondary}`}
          onClick={() => void copy(verifyUrl, "link")}
        >
          <Copy size={14} aria-hidden />
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ui.btn} ${ui.btnSecondary}`}
        >
          <ExternalLink size={14} aria-hidden />
          Open verifier
        </a>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost}`}
          onClick={() => void copy(cli, "cli")}
        >
          {copied === "cli" ? "CLI copied" : "Copy CLI"}
        </button>
      </div>
    </div>
  );
}
