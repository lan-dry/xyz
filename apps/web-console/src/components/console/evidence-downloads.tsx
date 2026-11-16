"use client";

import { useState } from "react";

import { ApiError, consoleDownload } from "@/lib/api";

import { ui } from "./console-ui";

/**
 * Evidence downloads for one case.
 * - Evidence bundle: signed forensic receipts, verifies offline (the proof).
 * - Evidence PDF: one page of plain facts, for reading.
 * - Summary: the old reading-only JSON, not independently verifiable.
 */
export function EvidenceDownloads({
  traceId,
  caseId,
  summaryJson,
  showSummary = true,
  showCaptions = false,
}: {
  traceId: string;
  caseId?: string | null;
  /** Reading-only summary (client generated). */
  summaryJson: () => unknown;
  showSummary?: boolean;
  showCaptions?: boolean;
}) {
  const [busy, setBusy] = useState<"bundle" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slug = (caseId || traceId).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 48);
  const encoded = encodeURIComponent(traceId);

  async function download(kind: "bundle" | "pdf") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "bundle") {
        await consoleDownload(`/traces/${encoded}/evidence-bundle`, `evidence-bundle-${slug}.json`);
      } else {
        await consoleDownload(`/traces/${encoded}/evidence-bundle.pdf`, `evidence-${slug}.pdf`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "There is no signed receipt for this case, so there is no evidence bundle to download. The summary below is still available."
          : err instanceof Error
            ? err.message
            : "Download failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  function downloadSummary() {
    const blob = new Blob([JSON.stringify(summaryJson(), null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `case-summary-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => void download("bundle")}
          disabled={busy !== null}
          title="Signed receipts that verify offline"
        >
          {busy === "bundle" ? "Preparing…" : "Download evidence bundle"}
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          onClick={() => void download("pdf")}
          disabled={busy !== null}
          title="One page of plain facts"
        >
          {busy === "pdf" ? "Preparing…" : "Download evidence PDF"}
        </button>
        {showSummary ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            onClick={downloadSummary}
            title="Summary for reading. Not independently verifiable."
          >
            Download summary
          </button>
        ) : null}
      </div>
      {showCaptions ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
          <strong>Evidence bundle:</strong> the signed record. Anyone can verify it offline
          or on the Verify page. <strong>PDF:</strong> one page, for reading.{" "}
          <strong>Summary:</strong> summary for reading. Not independently verifiable.
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
