/**
 * Seal a reconciliation report as a forensic receipt and render JSON/PDF exports.
 */
import type pg from "pg";
import { issueForensicReceipt } from "../forensic/issue.js";
import { renderOnePagePdf, type PdfLine } from "../forensic/minimal-pdf.js";
import type { SignedForensicReceipt } from "../forensic/receipt.js";
import type { ReconciliationReport } from "./types.js";

type Db = pg.Pool | pg.PoolClient;

export async function sealReconciliationReport(
  client: Db,
  report: ReconciliationReport,
  opts?: {
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<{ report: ReconciliationReport; receipt: SignedForensicReceipt }> {
  const caseId = `RECON-${report.run_id}`;
  const receipt = await issueForensicReceipt(client, {
    organization_id: report.organization_id,
    case_id: caseId,
    decision_id: `recon_${report.run_id}`,
    outcome: "reconciliation_report",
    mode: "record_only",
    matched_rules: [],
    plain_summary:
      `Reconciliation ${report.run_id}: ${report.matched_count} matched, ` +
      `${report.unmatched_feed_count} unmatched in feed, ` +
      `${report.unmatched_receipt_count} unmatched receipts, ` +
      `${report.exception_count} exception(s).`,
    sealed_events: [],
    attributes: {
      reconciliation_report: report,
    },
    signingKey: opts?.signingKey,
  });

  const sealed: ReconciliationReport = {
    ...report,
    sealed_at: receipt.issued_at,
    report_receipt_id: receipt.receipt_id,
    report_receipt_hash: receipt.receipt_hash,
  };

  await client.query(
    `UPDATE reconciliation_run
        SET report = $2::jsonb,
            report_receipt_id = $3,
            report_receipt_hash = $4
      WHERE run_id = $1`,
    [
      report.run_id,
      JSON.stringify(sealed),
      receipt.receipt_id,
      receipt.receipt_hash,
    ],
  );

  return { report: sealed, receipt };
}

export function renderReconciliationPdf(report: ReconciliationReport): Buffer {
  const lines: PdfLine[] = [
    { text: "Aegis reconciliation report", bold: true, size: 16 },
    { text: `Run ${report.run_id}`, size: 10, gapBefore: 8 },
    {
      text: `Period ${report.period_start} → ${report.period_end}`,
      size: 10,
    },
    {
      text: report.feed_name
        ? `Feed: ${report.feed_name}`
        : "Feed: all active feeds",
      size: 10,
    },
    { text: `Trigger: ${report.trigger}`, size: 10 },
    {
      text: `Matched: ${report.matched_count}   Unmatched feed: ${report.unmatched_feed_count}   Unmatched receipt: ${report.unmatched_receipt_count}`,
      size: 11,
      bold: true,
      gapBefore: 12,
    },
    {
      text: `Exceptions: ${report.exception_count}`,
      size: 11,
      bold: true,
      gapBefore: 4,
    },
  ];

  if (report.report_receipt_hash) {
    lines.push({
      text: `Sealed receipt: ${report.report_receipt_id}`,
      size: 9,
      gapBefore: 10,
    });
    lines.push({
      text: `Receipt hash: ${report.report_receipt_hash}`,
      size: 8,
    });
  }

  const show = report.exceptions.slice(0, 12);
  if (show.length) {
    lines.push({ text: "Exceptions", bold: true, size: 12, gapBefore: 14 });
    for (const ex of show) {
      lines.push({
        text: `• [${ex.severity}] ${ex.title}${ex.case_id ? ` (${ex.case_id})` : ""}`,
        size: 9,
        gapBefore: 4,
      });
    }
    if (report.exceptions.length > show.length) {
      lines.push({
        text: `… and ${report.exceptions.length - show.length} more`,
        size: 9,
        gapBefore: 4,
      });
    }
  }

  lines.push({
    text: "Aegis proves this report was sealed and unchanged. It does not check that the underlying data is accurate.",
    size: 8,
    gapBefore: 16,
  });

  return renderOnePagePdf(lines, "Aegis reconciliation report");
}
