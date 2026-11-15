/**
 * Canned forensic / bank-case reports scoped by organization_id (R8).
 */

import type pg from "pg";

export type CannedReportId =
  | "decisions_by_outcome"
  | "holds_pending"
  | "sealed_receipts";

export type CannedReportDefinition = {
  id: CannedReportId;
  title: string;
  description: string;
  columns: string[];
};

export const CANNED_REPORTS: CannedReportDefinition[] = [
  {
    id: "decisions_by_outcome",
    title: "Decisions by outcome",
    description: "Bank cases grouped by outcome and mode for this organization.",
    columns: ["outcome", "mode", "case_count"],
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
  },
];

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
): string {
  const header = columns.map(csvEscape).join(",");
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
    csv: rowsToCsv(definition.columns, rows),
    definition,
  };
}
