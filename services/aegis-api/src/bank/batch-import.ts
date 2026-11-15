/**
 * File / batch import adapter (P5): CSV and JSON Lines → bank events (record-only).
 */

import { parseBankEvent, BankValidationError } from "./validate.js";
import type { BankEvent } from "./types.js";

export type ColumnMapping = Record<string, string>; // bank column → aegis attribute path

export type BatchRowError = {
  row: number;
  code: string;
  message: string;
};

export type BatchDryRunReport = {
  total_rows: number;
  valid_rows: number;
  errors: BatchRowError[];
  sample_events: BankEvent[];
};

export type BatchParseResult = {
  events: BankEvent[];
  errors: BatchRowError[];
};

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function applyColumnMapping(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(mapping)) {
    const value = Object.prototype.hasOwnProperty.call(row, from)
      ? row[from]
      : getByPath(row, from);
    if (value !== undefined) setByPath(out, to, value);
  }
  return out;
}

export function parseJsonLines(text: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as unknown;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        throw new Error("row must be a JSON object");
      }
      rows.push(obj as Record<string, unknown>);
    } catch (err) {
      throw new Error(
        `JSONL line ${i + 1}: ${err instanceof Error ? err.message : "parse error"}`,
      );
    }
  }
  return rows;
}

/** Minimal CSV parser (quoted fields supported). */
export function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function rowsToBankEvents(
  rows: Record<string, unknown>[],
  options: {
    mapping: ColumnMapping;
    defaults?: Partial<BankEvent>;
    record_only?: boolean;
  },
): BatchParseResult {
  const events: BankEvent[] = [];
  const errors: BatchRowError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const mapped = applyColumnMapping(rows[i]!, options.mapping);
    const merged = {
      schema_version: 1,
      event_type: "generic",
      emitted_at: new Date().toISOString(),
      ...options.defaults,
      ...mapped,
      attributes: {
        ...(typeof options.defaults?.attributes === "object"
          ? options.defaults.attributes
          : {}),
        ...(typeof mapped.attributes === "object" && mapped.attributes
          ? (mapped.attributes as Record<string, unknown>)
          : mapped),
      },
    };
    // Prefer explicit top-level fields when mapping set them
    for (const key of [
      "case_id",
      "idempotency_key",
      "event_type",
      "product",
      "workflow_id",
      "emitted_at",
      "trace_id",
    ] as const) {
      if (mapped[key] != null) (merged as Record<string, unknown>)[key] = mapped[key];
    }
    try {
      const event = parseBankEvent(merged);
      events.push(event);
    } catch (err) {
      if (err instanceof BankValidationError) {
        errors.push({
          row: i + 1,
          code: err.body.code,
          message: err.body.message,
        });
      } else {
        errors.push({
          row: i + 1,
          code: "parse_error",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }
  return { events, errors };
}

export function dryRunBatch(
  text: string,
  format: "csv" | "jsonl",
  mapping: ColumnMapping,
  defaults?: Partial<BankEvent>,
): BatchDryRunReport {
  const rows = format === "csv" ? parseCsv(text) : parseJsonLines(text);
  const { events, errors } = rowsToBankEvents(rows, {
    mapping,
    defaults,
    record_only: true,
  });
  return {
    total_rows: rows.length,
    valid_rows: events.length,
    errors,
    sample_events: events.slice(0, 5),
  };
}

export type BatchCommitRowResult = {
  row: number;
  case_id: string;
  decision_id: string;
  outcome: string;
  mode: "enforce" | "record_only";
  event_id: string | null;
  would_have?: string;
};

export type BatchImportReport = {
  dry_run: boolean;
  /** Batch import always evaluates as record-only. */
  record_only: true;
  total_rows: number;
  valid_rows: number;
  committed_rows: number;
  errors: BatchRowError[];
  sample_events: BankEvent[];
  results: BatchCommitRowResult[];
};

/**
 * Parse + optionally commit batch rows. Commit path must force record-only
 * via the provided handler (e.g. handleBankEvent with forceRecordOnly).
 */
export async function runBatchImport(
  text: string,
  format: "csv" | "jsonl",
  mapping: ColumnMapping,
  options: {
    dry_run?: boolean;
    defaults?: Partial<BankEvent>;
    commit?: (event: BankEvent) => Promise<{
      case_id: string;
      decision_id: string;
      outcome: string;
      mode: "enforce" | "record_only";
      event_id: string | null;
      would_have?: string;
    }>;
  } = {},
): Promise<BatchImportReport> {
  const dryRun = options.dry_run !== false;
  const rows = format === "csv" ? parseCsv(text) : parseJsonLines(text);
  const { events, errors } = rowsToBankEvents(rows, {
    mapping,
    defaults: options.defaults,
    record_only: true,
  });

  const results: BatchCommitRowResult[] = [];
  if (!dryRun && options.commit) {
    // Map valid events back to 1-based source row numbers (skip error rows).
    const errorRows = new Set(errors.map((e) => e.row));
    let eventIdx = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      if (errorRows.has(rowNum)) continue;
      const event = events[eventIdx++];
      if (!event) break;
      const decision = await options.commit(event);
      results.push({
        row: rowNum,
        case_id: decision.case_id,
        decision_id: decision.decision_id,
        outcome: decision.outcome,
        mode: decision.mode,
        event_id: decision.event_id,
        would_have: decision.would_have,
      });
    }
  }

  return {
    dry_run: dryRun,
    record_only: true,
    total_rows: rows.length,
    valid_rows: events.length,
    committed_rows: results.length,
    errors,
    sample_events: events.slice(0, 5),
    results,
  };
}
