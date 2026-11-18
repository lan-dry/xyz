/**
 * Stage 6: link independent collector CDC events to application cases.
 *
 * - Matched pair (collector change + app sealed receipt for same case_id)
 *   → recordGradeChange to G3 (independently_captured).
 * - Collector change with no matching app event
 *   → db_change_without_event exception.
 */
import type pg from "pg";
import {
  GradeChangeError,
  getCurrentGrade,
  recordGradeChange,
} from "../forensic/case-provenance.js";
import { gradeRank } from "../sources/provenance.js";
import { upsertException, type ExceptionRow } from "./exceptions.js";

type Db = pg.Pool | pg.PoolClient;

export type CollectorCdcRow = {
  event_id: string;
  organization_id: string;
  source_id: string;
  case_id: string | null;
  schema_name: string;
  table_name: string;
  operation: string;
  row_key: Record<string, unknown>;
  new_values_hash: string;
  lsn: string;
  captured_at: Date;
  matched_case_id: string | null;
};

export type CollectorMatchResult = {
  matched: string[];
  exceptions: ExceptionRow[];
  scanned: number;
};

async function loadCollectorEvents(
  client: Db,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CollectorCdcRow[]> {
  const r = await client.query<CollectorCdcRow>(
    `SELECT event_id, organization_id, source_id, case_id, schema_name, table_name,
            operation, row_key, new_values_hash, lsn, captured_at, matched_case_id
       FROM collector_cdc_event
      WHERE organization_id = $1
        AND captured_at >= $2::timestamptz
        AND captured_at < $3::timestamptz
      ORDER BY captured_at ASC, event_id`,
    [organizationId, periodStart, periodEnd],
  );
  return r.rows;
}

async function appCaseExists(
  client: Db,
  organizationId: string,
  caseId: string,
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM forensic_receipt
      WHERE organization_id = $1 AND case_id = $2
        AND outcome <> 'grade_change'
        AND outcome <> 'reconciliation_report'
      LIMIT 1`,
    [organizationId, caseId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Reconcile collector CDC events for the period. Safe to call on every
 * reconciliation run (org-wide). Feed-scoped runs still run this pass so a
 * direct DB write is not missed because an operator filtered by feed.
 */
export async function reconcileCollectorEvents(
  client: Db,
  input: {
    organization_id: string;
    run_id: string;
    period_start: string;
    period_end: string;
    now?: Date;
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<CollectorMatchResult> {
  const now = input.now ?? new Date();
  const events = await loadCollectorEvents(
    client,
    input.organization_id,
    input.period_start,
    input.period_end,
  );
  const matched: string[] = [];
  const exceptions: ExceptionRow[] = [];

  for (const ev of events) {
    const caseId = ev.case_id?.trim() || null;
    if (!caseId) {
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "db_change_without_event",
        run_id: input.run_id,
        source_name: ev.source_id,
        fingerprint_key: `${ev.source_id}:${ev.lsn}:${ev.event_id}`,
        detail: {
          reason: "collector_change_without_case_id",
          schema: ev.schema_name,
          table: ev.table_name,
          operation: ev.operation,
          row_key: ev.row_key,
          new_values_hash: ev.new_values_hash,
          lsn: ev.lsn,
          collector_event_id: ev.event_id,
        },
      });
      exceptions.push(exception);
      continue;
    }

    const hasApp = await appCaseExists(
      client,
      input.organization_id,
      caseId,
    );

    if (!hasApp) {
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "db_change_without_event",
        run_id: input.run_id,
        case_id: caseId,
        source_name: ev.source_id,
        fingerprint_key: `${caseId}:${ev.lsn}`,
        detail: {
          reason: "ledger_row_changed_without_app_event",
          schema: ev.schema_name,
          table: ev.table_name,
          operation: ev.operation,
          row_key: ev.row_key,
          new_values_hash: ev.new_values_hash,
          lsn: ev.lsn,
          collector_event_id: ev.event_id,
          collector_source_id: ev.source_id,
        },
      });
      exceptions.push(exception);
      continue;
    }

    // Matched pair → G3.
    matched.push(caseId);
    if (!ev.matched_case_id) {
      await client.query(
        `UPDATE collector_cdc_event
            SET matched_case_id = $2, matched_at = $3::timestamptz
          WHERE event_id = $1`,
        [ev.event_id, caseId, now.toISOString()],
      );
    }

    const reason = `independently captured by ${ev.source_id} (LSN ${ev.lsn}) on ${now.toISOString()}`;
    try {
      const current = await getCurrentGrade(
        client,
        input.organization_id,
        caseId,
      );
      if (gradeRank(current) < gradeRank("G3")) {
        await recordGradeChange(client, {
          organization_id: input.organization_id,
          case_id: caseId,
          to_grade: "G3",
          reason,
          feed_name: ev.source_id,
          checks: { independently_captured: true },
          issued_at: now.toISOString(),
          signingKey: input.signingKey,
        });
      }
    } catch (err) {
      if (!(err instanceof GradeChangeError)) throw err;
    }
  }

  return { matched, exceptions, scanned: events.length };
}

/** Test / admin helper: insert a collector CDC row without going through HTTP. */
export async function insertCollectorCdcEvent(
  client: Db,
  input: {
    organization_id: string;
    source_id: string;
    key_id?: string;
    case_id?: string | null;
    schema_name?: string;
    table_name: string;
    operation: "insert" | "update" | "delete" | "truncate";
    row_key: Record<string, unknown>;
    new_values_hash: string;
    lsn: string;
    captured_at?: string;
    event_id?: string;
    idempotency_key?: string;
    event_hash?: string;
    envelope_seq?: number;
  },
): Promise<CollectorCdcRow> {
  const eventId =
    input.event_id ?? `cdc_${input.lsn.replace(/\W/g, "")}_${Date.now()}`;
  const idem =
    input.idempotency_key ??
    `idem_${input.source_id}_${input.lsn}_${input.table_name}`;
  const r = await client.query<CollectorCdcRow>(
    `INSERT INTO collector_cdc_event (
       event_id, organization_id, source_id, key_id, case_id,
       schema_name, table_name, operation, row_key, new_values_hash, lsn,
       envelope_seq, event_hash, idempotency_key, captured_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::timestamptz
     )
     ON CONFLICT (organization_id, source_id, idempotency_key) DO NOTHING
     RETURNING event_id, organization_id, source_id, case_id, schema_name, table_name,
               operation, row_key, new_values_hash, lsn, captured_at, matched_case_id`,
    [
      eventId,
      input.organization_id,
      input.source_id,
      input.key_id ?? "k_cdc",
      input.case_id ?? null,
      input.schema_name ?? "public",
      input.table_name,
      input.operation,
      JSON.stringify(input.row_key),
      input.new_values_hash,
      input.lsn,
      input.envelope_seq ?? 1,
      input.event_hash ?? "a".repeat(64),
      idem,
      input.captured_at ?? new Date().toISOString(),
    ],
  );
  if (r.rows[0]) return r.rows[0];
  const existing = await client.query<CollectorCdcRow>(
    `SELECT event_id, organization_id, source_id, case_id, schema_name, table_name,
            operation, row_key, new_values_hash, lsn, captured_at, matched_case_id
       FROM collector_cdc_event
      WHERE organization_id = $1 AND source_id = $2 AND idempotency_key = $3`,
    [input.organization_id, input.source_id, idem],
  );
  return existing.rows[0]!;
}
