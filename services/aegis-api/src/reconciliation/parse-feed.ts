/**
 * Parse JSON Lines / CSV feed bodies using a per-feed column mapping.
 */
import { createHash } from "node:crypto";
import type { FeedColumnMapping, FeedColumnTarget } from "./types.js";

export type ParsedFeedRow = {
  external_id: string;
  case_id: string | null;
  token_id: string | null;
  amount: string | null;
  currency: string | null;
  beneficiary_account: string | null;
  executed_at: string | null;
  raw: Record<string, unknown>;
  content_hash: string;
};

export class FeedParseError extends Error {
  constructor(
    readonly code: "empty" | "invalid_json" | "invalid_csv" | "missing_key",
    message: string,
  ) {
    super(message);
    this.name = "FeedParseError";
  }
}

const DEFAULT_MAPPING: FeedColumnMapping = {
  case_id: "case_id",
  token_id: "token_id",
  amount: "amount",
  currency: "currency",
  beneficiary_account: "beneficiary_account",
  executed_at: "executed_at",
  external_id: "external_id",
};

export function mergeMapping(raw: unknown): FeedColumnMapping {
  const base = { ...DEFAULT_MAPPING };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (k === "case_id" ||
        k === "token_id" ||
        k === "amount" ||
        k === "currency" ||
        k === "beneficiary_account" ||
        k === "executed_at" ||
        k === "external_id") &&
      typeof v === "string" &&
      v.trim()
    ) {
      base[k as FeedColumnTarget] = v.trim();
    }
  }
  return base;
}

function cell(row: Record<string, unknown>, key: string | undefined): unknown {
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

function contentHash(raw: Record<string, unknown>): string {
  const keys = Object.keys(raw).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = raw[k];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function mapRow(
  raw: Record<string, unknown>,
  mapping: FeedColumnMapping,
  lineNo: number,
): ParsedFeedRow {
  const caseId = asString(cell(raw, mapping.case_id));
  const tokenId = asString(cell(raw, mapping.token_id));
  const amount = asString(cell(raw, mapping.amount));
  const currency = asString(cell(raw, mapping.currency));
  const beneficiary = asString(cell(raw, mapping.beneficiary_account));
  const executedAt = asString(cell(raw, mapping.executed_at));
  let externalId = asString(cell(raw, mapping.external_id));
  if (!externalId) {
    externalId =
      caseId ??
      tokenId ??
      `row_${lineNo}_${contentHash(raw).slice(0, 12)}`;
  }
  return {
    external_id: externalId,
    case_id: caseId,
    token_id: tokenId,
    amount,
    currency,
    beneficiary_account: beneficiary,
    executed_at: executedAt,
    raw,
    content_hash: contentHash(raw),
  };
}

function parseJsonLines(
  text: string,
  mapping: FeedColumnMapping,
): ParsedFeedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new FeedParseError("empty", "Feed body is empty.");
  }
  const out: ParsedFeedRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new FeedParseError(
        "invalid_json",
        `Line ${i + 1} is not valid JSON.`,
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new FeedParseError(
        "invalid_json",
        `Line ${i + 1} must be a JSON object.`,
      );
    }
    out.push(mapRow(parsed as Record<string, unknown>, mapping, i + 1));
  }
  return out;
}

function parseJsonArray(
  text: string,
  mapping: FeedColumnMapping,
): ParsedFeedRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FeedParseError("invalid_json", "Body is not valid JSON.");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? [parsed]
      : null;
  if (!list) {
    throw new FeedParseError(
      "invalid_json",
      "JSON body must be an object or an array of rows.",
    );
  }
  return list.map((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new FeedParseError(
        "invalid_json",
        `Row ${i + 1} must be a JSON object.`,
      );
    }
    return mapRow(row as Record<string, unknown>, mapping, i + 1);
  });
}

/** Minimal CSV: first line headers, commas, optional double quotes. */
function parseCsv(text: string, mapping: FeedColumnMapping): ParsedFeedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new FeedParseError("empty", "CSV needs a header and at least one row.");
  }
  const headers = splitCsvLine(lines[0]!);
  if (headers.length === 0) {
    throw new FeedParseError("invalid_csv", "CSV header is empty.");
  }
  const out: ParsedFeedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const raw: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      raw[headers[c]!] = cells[c] ?? "";
    }
    out.push(mapRow(raw, mapping, i));
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export type FeedFormat = "jsonl" | "csv" | "json";

export function detectFormat(
  body: string,
  hint?: string | null,
): FeedFormat {
  const h = (hint ?? "").toLowerCase().trim();
  if (h === "csv" || h === "text/csv") return "csv";
  if (h === "jsonl" || h === "ndjson" || h === "application/x-ndjson") {
    return "jsonl";
  }
  if (h === "json" || h === "application/json") return "json";
  const trimmed = body.trim();
  if (trimmed.startsWith("[")) return "json";
  if (trimmed.includes(",") && !trimmed.startsWith("{") && trimmed.includes("\n")) {
    const first = trimmed.split(/\r?\n/)[0] ?? "";
    if (!first.trim().startsWith("{")) return "csv";
  }
  return "jsonl";
}

export function parseFeedBody(
  body: string,
  mappingRaw: unknown,
  formatHint?: string | null,
): ParsedFeedRow[] {
  const mapping = mergeMapping(mappingRaw);
  const format = detectFormat(body, formatHint);
  if (format === "csv") return parseCsv(body, mapping);
  if (format === "json") return parseJsonArray(body, mapping);
  return parseJsonLines(body, mapping);
}
