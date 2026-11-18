/**
 * Upsert reconciliation exceptions (idempotent by fingerprint) and status notes.
 */
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { catalogFor } from "./exception-catalog.js";
import type {
  ExceptionSeverity,
  ExceptionStatus,
  ReconciliationExceptionKind,
} from "./types.js";

type Db = pg.Pool | pg.PoolClient;

export type ExceptionRow = {
  exception_id: string;
  organization_id: string;
  fingerprint: string;
  kind: ReconciliationExceptionKind;
  severity: ExceptionSeverity;
  title: string;
  source_name: string | null;
  case_id: string | null;
  token_id: string | null;
  feed_id: string | null;
  feed_row_id: string | null;
  detail: Record<string, unknown>;
  status: ExceptionStatus;
  first_seen_at: Date;
  first_seen_run_id: string | null;
  last_seen_at: Date;
  last_seen_run_id: string | null;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  acknowledge_note: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolve_note: string | null;
};

export type RaiseExceptionInput = {
  organization_id: string;
  kind: ReconciliationExceptionKind;
  run_id?: string | null;
  case_id?: string | null;
  token_id?: string | null;
  feed_id?: string | null;
  feed_row_id?: string | null;
  source_name?: string | null;
  detail?: Record<string, unknown>;
  /** Extra fingerprint salt (e.g. gap from_seq). */
  fingerprint_key?: string | null;
  title?: string;
  severity?: ExceptionSeverity;
};

export function exceptionFingerprint(input: {
  kind: string;
  case_id?: string | null;
  token_id?: string | null;
  feed_id?: string | null;
  feed_row_id?: string | null;
  fingerprint_key?: string | null;
}): string {
  const parts = [
    input.kind,
    input.case_id ?? "",
    input.token_id ?? "",
    input.feed_id ?? "",
    input.feed_row_id ?? "",
    input.fingerprint_key ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function upsertException(
  client: Db,
  input: RaiseExceptionInput,
): Promise<{ exception: ExceptionRow; created: boolean }> {
  const cat = catalogFor(input.kind);
  const fingerprint = exceptionFingerprint(input);
  const existing = await client.query<ExceptionRow>(
    `SELECT *
       FROM reconciliation_exception
      WHERE organization_id = $1 AND fingerprint = $2`,
    [input.organization_id, fingerprint],
  );
  const now = new Date();
  if (existing.rows[0]) {
    const row = existing.rows[0];
    await client.query(
      `UPDATE reconciliation_exception
          SET last_seen_at = $2,
              last_seen_run_id = COALESCE($3, last_seen_run_id),
              detail = COALESCE($4::jsonb, detail),
              source_name = COALESCE($5, source_name),
              case_id = COALESCE($6, case_id),
              token_id = COALESCE($7, token_id),
              feed_id = COALESCE($8, feed_id),
              feed_row_id = COALESCE($9, feed_row_id)
        WHERE exception_id = $1`,
      [
        row.exception_id,
        now.toISOString(),
        input.run_id ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
        input.source_name ?? null,
        input.case_id ?? null,
        input.token_id ?? null,
        input.feed_id ?? null,
        input.feed_row_id ?? null,
      ],
    );
    const refreshed = await client.query<ExceptionRow>(
      `SELECT * FROM reconciliation_exception WHERE exception_id = $1`,
      [row.exception_id],
    );
    return { exception: refreshed.rows[0]!, created: false };
  }

  const exceptionId = `rex_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await client.query(
    `INSERT INTO reconciliation_exception (
       exception_id, organization_id, fingerprint, kind, severity, title,
       source_name, case_id, token_id, feed_id, feed_row_id, detail,
       status, first_seen_at, first_seen_run_id, last_seen_at, last_seen_run_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,
       'open',$13::timestamptz,$14,$13::timestamptz,$14
     )`,
    [
      exceptionId,
      input.organization_id,
      fingerprint,
      input.kind,
      input.severity ?? cat.severity,
      input.title ?? cat.title,
      input.source_name ?? null,
      input.case_id ?? null,
      input.token_id ?? null,
      input.feed_id ?? null,
      input.feed_row_id ?? null,
      JSON.stringify(input.detail ?? {}),
      now.toISOString(),
      input.run_id ?? null,
    ],
  );
  const created = await client.query<ExceptionRow>(
    `SELECT * FROM reconciliation_exception WHERE exception_id = $1`,
    [exceptionId],
  );
  return { exception: created.rows[0]!, created: true };
}

/** Manually raise a stub / ad-hoc exception (Stage 6/7 types, tests). */
export async function raiseManualException(
  client: Db,
  input: RaiseExceptionInput,
): Promise<ExceptionRow> {
  const { exception } = await upsertException(client, input);
  return exception;
}

export async function listExceptions(
  client: Db,
  organizationId: string,
  opts?: { status?: ExceptionStatus | "all"; limit?: number },
): Promise<ExceptionRow[]> {
  const status = opts?.status && opts.status !== "all" ? opts.status : null;
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
  const r = await client.query<ExceptionRow>(
    `SELECT *
       FROM reconciliation_exception
      WHERE organization_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY first_seen_at DESC
      LIMIT $3`,
    [organizationId, status, limit],
  );
  return r.rows;
}

export async function getException(
  client: Db,
  organizationId: string,
  exceptionId: string,
): Promise<ExceptionRow | null> {
  const r = await client.query<ExceptionRow>(
    `SELECT * FROM reconciliation_exception
      WHERE organization_id = $1 AND exception_id = $2`,
    [organizationId, exceptionId],
  );
  return r.rows[0] ?? null;
}

export async function listExceptionNotes(
  client: Db,
  organizationId: string,
  exceptionId: string,
): Promise<
  Array<{
    note_id: string;
    action: string;
    note: string;
    actor: string | null;
    created_at: Date;
  }>
> {
  const r = await client.query<{
    note_id: string;
    action: string;
    note: string;
    actor: string | null;
    created_at: Date;
  }>(
    `SELECT note_id, action, note, actor, created_at
       FROM reconciliation_exception_note
      WHERE organization_id = $1 AND exception_id = $2
      ORDER BY created_at ASC`,
    [organizationId, exceptionId],
  );
  return r.rows;
}

export class ExceptionStatusError extends Error {
  constructor(
    readonly code: "not_found" | "note_required" | "invalid_transition",
    message: string,
  ) {
    super(message);
    this.name = "ExceptionStatusError";
  }
}

async function addNote(
  client: Db,
  organizationId: string,
  exceptionId: string,
  action: "acknowledged" | "resolved" | "note",
  note: string,
  actor: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO reconciliation_exception_note (
       note_id, organization_id, exception_id, action, note, actor
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      `ren_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      organizationId,
      exceptionId,
      action,
      note,
      actor,
    ],
  );
}

export async function acknowledgeException(
  client: Db,
  organizationId: string,
  exceptionId: string,
  note: string,
  actor: string | null,
): Promise<ExceptionRow> {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new ExceptionStatusError(
      "note_required",
      "A note is required to acknowledge an exception.",
    );
  }
  const row = await getException(client, organizationId, exceptionId);
  if (!row) {
    throw new ExceptionStatusError("not_found", "Exception not found.");
  }
  if (row.status === "resolved") {
    throw new ExceptionStatusError(
      "invalid_transition",
      "A resolved exception cannot be acknowledged.",
    );
  }
  const now = new Date().toISOString();
  await client.query(
    `UPDATE reconciliation_exception
        SET status = 'acknowledged',
            acknowledged_at = $3::timestamptz,
            acknowledged_by = $4,
            acknowledge_note = $5
      WHERE exception_id = $1 AND organization_id = $2`,
    [exceptionId, organizationId, now, actor, trimmed],
  );
  await addNote(client, organizationId, exceptionId, "acknowledged", trimmed, actor);
  return (await getException(client, organizationId, exceptionId))!;
}

export async function resolveException(
  client: Db,
  organizationId: string,
  exceptionId: string,
  note: string,
  actor: string | null,
): Promise<ExceptionRow> {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new ExceptionStatusError(
      "note_required",
      "A note is required to resolve an exception.",
    );
  }
  const row = await getException(client, organizationId, exceptionId);
  if (!row) {
    throw new ExceptionStatusError("not_found", "Exception not found.");
  }
  const now = new Date().toISOString();
  await client.query(
    `UPDATE reconciliation_exception
        SET status = 'resolved',
            resolved_at = $3::timestamptz,
            resolved_by = $4,
            resolve_note = $5
      WHERE exception_id = $1 AND organization_id = $2`,
    [exceptionId, organizationId, now, actor, trimmed],
  );
  await addNote(client, organizationId, exceptionId, "resolved", trimmed, actor);
  return (await getException(client, organizationId, exceptionId))!;
}
