/**
 * Canned forensic / bank-case reports scoped by organization_id (R8).
 */

import type pg from "pg";
import { OUTCOME_LABELS } from "../bank/describe-decision.js";

export type CannedReportId =
  | "decisions_by_outcome"
  | "holds_pending"
  | "sealed_receipts";

export type CannedReportDefinition = {
  id: CannedReportId;
  title: string;
  description: string;
  /** Row keys, in order. */
  columns: string[];
  /** Plain-language heading for each column (CSV header and preview table). */
  labels: Record<string, string>;
};

export const CANNED_REPORTS: CannedReportDefinition[] = [
  {
    id: "decisions_by_outcome",
    title: "Decisions by outcome",
    description: "Bank cases grouped by outcome and mode for this organization.",
    columns: ["outcome", "mode", "case_count"],
    labels: {
      outcome: "Decision",
      mode: "Mode",
      case_count: "Number of cases",
    },
  },
  {
    id: "holds_pending",
    title: "Holds pending",
    description: "Cases currently held awaiting approval.",
    columns: [
      "case_id",
      "decision_id",
      "receipt_id",
      "outcome",
      "status",
      "created_at",
    ],
    labels: {
      case_id: "Case",
      decision_id: "Decision reference",
      receipt_id: "Receipt",
      outcome: "Decision",
      status: "Status",
      created_at: "Opened (UTC)",
    },
  },
  {
    id: "sealed_receipts",
    title: "Sealed receipts",
    description: "Forensic receipts issued for this organization.",
    columns: [
      "receipt_id",
      "seq",
      "case_id",
      "decision_id",
      "outcome",
      "mode",
      "receipt_hash",
      "issued_at",
    ],
    labels: {
      receipt_id: "Receipt",
      seq: "Record number",
      case_id: "Case",
      decision_id: "Decision reference",
      outcome: "Decision",
      mode: "Mode",
      receipt_hash: "Record fingerprint",
      issued_at: "Signed at (UTC)",
    },
  },
];

const MODE_LABELS: Record<string, string> = {
  enforce: "Enforced",
  record_only: "Recorded only",
};

/** Plain wording for values people read in a report (CSV and preview). */
export function displayReportRow(row: ReportRow): ReportRow {
  const out: ReportRow = { ...row };
  if (typeof out.outcome === "string") {
    out.outcome = OUTCOME_LABELS[out.outcome] ?? out.outcome;
  }
  if (typeof out.mode === "string") {
    out.mode = MODE_LABELS[out.mode] ?? out.mode;
  }
  if (typeof out.status === "string") {
    const s = out.status;
    out.status =
      s === "held" ? "Held" : s === "stopped" ? "Stopped" : s === "approved" ? "Approved" : s;
  }
  return out;
}

export function listCannedReports(): CannedReportDefinition[] {
  return CANNED_REPORTS;
}

export function getCannedReport(
  id: string,
): CannedReportDefinition | undefined {
  return CANNED_REPORTS.find((r) => r.id === id);
}

export type ReportRow = Record<string, string | number | null>;

export async function queryCannedReport(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  reportId: CannedReportId,
  limit = 5000,
): Promise<ReportRow[]> {
  const capped = Math.min(Math.max(Math.floor(limit), 1), 10_000);

  if (reportId === "decisions_by_outcome") {
    const result = await client.query<{
      outcome: string | null;
      mode: string;
      case_count: string;
    }>(
      `SELECT outcome, mode, COUNT(*)::text AS case_count
       FROM bank_case
       WHERE organization_id = $1
       GROUP BY outcome, mode
       ORDER BY outcome NULLS LAST, mode
       LIMIT $2`,
      [organizationId, capped],
    );
    return result.rows.map((r) => ({
      outcome: r.outcome,
      mode: r.mode,
      case_count: Number(r.case_count),
    }));
  }

  if (reportId === "holds_pending") {
    const result = await client.query<{
      case_id: string;
      decision_id: string | null;
      receipt_id: string | null;
      outcome: string | null;
      status: string;
      created_at: Date;
    }>(
      `SELECT case_id, decision_id, receipt_id, outcome, status, created_at
       FROM bank_case
       WHERE organization_id = $1
         AND (status = 'held' OR outcome = 'hold')
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, capped],
    );
    return result.rows.map((r) => ({
      case_id: r.case_id,
      decision_id: r.decision_id,
      receipt_id: r.receipt_id,
      outcome: r.outcome,
      status: r.status,
      created_at: r.created_at.toISOString(),
    }));
  }

  // sealed_receipts
  const result = await client.query<{
    receipt_id: string;
    seq: string;
    case_id: string | null;
    decision_id: string;
    outcome: string;
    mode: string;
    receipt_hash: string;
    issued_at: Date;
  }>(
    `SELECT receipt_id, seq::text AS seq, case_id, decision_id, outcome, mode,
            receipt_hash, issued_at
     FROM forensic_receipt
     WHERE organization_id = $1
     ORDER BY seq DESC
     LIMIT $2`,
    [organizationId, capped],
  );
  return result.rows.map((r) => ({
    receipt_id: r.receipt_id,
    seq: Number(r.seq),
    case_id: r.case_id,
    decision_id: r.decision_id,
    outcome: r.outcome,
    mode: r.mode,
    receipt_hash: r.receipt_hash,
    issued_at: r.issued_at.toISOString(),
  }));
}

/** Escape a CSV cell (RFC 4180-ish). */
export function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(
  columns: string[],
  rows: ReportRow[],
  labels?: Record<string, string>,
): string {
  const header = columns.map((col) => csvEscape(labels?.[col] ?? col)).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(row[col])).join(","),
  );
  return [header, ...lines].join("\n") + (lines.length > 0 ? "\n" : "");
}

export async function exportCannedReportCsv(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  reportId: CannedReportId,
  limit = 5000,
): Promise<{ csv: string; definition: CannedReportDefinition }> {
  const definition = getCannedReport(reportId);
  if (!definition) {
    throw new Error(`Unknown report: ${reportId}`);
  }
  const rows = await queryCannedReport(
    client,
    organizationId,
    reportId,
    limit,
  );
  return {
    csv: rowsToCsv(
      definition.columns,
      rows.map(displayReportRow),
      definition.labels,
    ),
    definition,
  };
}

export type ReportPreview = {
  report_id: CannedReportId;
  title: string;
  columns: Array<{ key: string; label: string }>;
  /** First rows only, in the same plain wording as the CSV. */
  rows: ReportRow[];
  total: number;
  /** True when more than the query cap exists (total is then a floor). */
  total_capped: boolean;
};

const PREVIEW_COUNT_CAP = 10_000;

/** First rows + row count, shown before the CSV is downloaded. */
export async function previewCannedReport(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  reportId: CannedReportId,
  limit = 10,
): Promise<ReportPreview> {
  const definition = getCannedReport(reportId);
  if (!definition) {
    throw new Error(`Unknown report: ${reportId}`);
  }
  const shown = Math.min(Math.max(Math.floor(limit) || 10, 1), 50);
  const rows = await queryCannedReport(
    client,
    organizationId,
    reportId,
    PREVIEW_COUNT_CAP,
  );
  return {
    report_id: definition.id,
    title: definition.title,
    columns: definition.columns.map((key) => ({
      key,
      label: definition.labels[key] ?? key,
    })),
    rows: rows.slice(0, shown).map(displayReportRow),
    total: rows.length,
    total_capped: rows.length >= PREVIEW_COUNT_CAP,
  };
}
