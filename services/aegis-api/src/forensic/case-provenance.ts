/**
 * Case-level provenance from the database: the current grade (read from sealed grade-change
 * receipts) and the helper that records a grade rise.
 *
 * The signed receipts are the source of truth. `evidence_grade_change` is a queryable index of
 * the grade_change receipts; `recordGradeChange` writes both.
 */
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { issueForensicReceipt } from "./issue.js";
import type { SealedEventRef, SignedForensicReceipt } from "./receipt.js";
import type { EvidenceGrade } from "../sources/grade.js";
import {
  buildCaseProvenance,
  GRADE_CHANGE_OUTCOME,
  gradeFromChecks,
  gradeRank,
  mergeChecks,
  type CaseProvenanceView,
  type GradeChangeRecord,
  type ProvenanceChecks,
  type ProvenanceReceiptLike,
} from "../sources/provenance.js";

type Db = pg.Pool | pg.PoolClient;

/** A receipt row with just what provenance and grade changes need. */
export type LiteReceipt = ProvenanceReceiptLike & {
  receipt_hash: string;
  case_id: string;
  decision_id: string;
  body: Record<string, unknown>;
};

export class GradeChangeError extends Error {
  constructor(
    readonly code:
      | "case_not_found"
      | "grade_must_rise"
      | "reason_required"
      | "from_grade_mismatch"
      | "checks_do_not_support_grade",
    message: string,
  ) {
    super(message);
    this.name = "GradeChangeError";
  }
}

type RawRow = {
  receipt_id: string;
  seq: string;
  receipt_hash: string;
  case_id: string;
  decision_id: string;
  outcome: string;
  body: Record<string, unknown> | null;
};

function toLite(row: RawRow): LiteReceipt {
  const body = row.body ?? {};
  return {
    receipt_id: row.receipt_id,
    seq: Number(row.seq),
    receipt_hash: row.receipt_hash,
    case_id: row.case_id,
    decision_id: row.decision_id,
    outcome: row.outcome,
    issued_at: typeof body.issued_at === "string" ? body.issued_at : "",
    provenance: body.provenance,
    attributes:
      body.attributes && typeof body.attributes === "object"
        ? (body.attributes as Record<string, unknown>)
        : undefined,
    body,
  };
}

/**
 * Only what provenance needs (issued_at, provenance block, source envelope identity, grade
 * change facts, sealed events), not the whole body. Keeps case lists cheap.
 */
const TRIMMED_BODY_SQL = `(jsonb_build_object(
  'issued_at', body->'issued_at',
  'provenance', body->'provenance',
  'sealed_events', body->'sealed_events',
  'attributes', jsonb_build_object(
    'grade_change', body->'attributes'->'grade_change',
    'source_envelope', CASE
      WHEN body->'attributes'->'source_envelope' IS NULL THEN NULL
      ELSE jsonb_build_object(
        'key_id', body->'attributes'->'source_envelope'->'key_id',
        'source_id', body->'attributes'->'source_envelope'->'source_id',
        'signature', body->'attributes'->'source_envelope'->'signature')
    END)
))`;

/** Receipts for each case (oldest first). `full` loads whole bodies (needed to issue receipts). */
export async function loadCaseReceiptsLite(
  client: Db,
  organizationId: string,
  caseIds: string[],
  options?: { full?: boolean },
): Promise<Map<string, LiteReceipt[]>> {
  const out = new Map<string, LiteReceipt[]>();
  if (caseIds.length === 0) return out;
  const rows = await client.query<RawRow>(
    `SELECT receipt_id, seq::text, receipt_hash, case_id, decision_id, outcome,
            ${options?.full ? "body" : TRIMMED_BODY_SQL} AS body
       FROM forensic_receipt
      WHERE organization_id = $1 AND case_id = ANY($2::text[])
      ORDER BY seq ASC`,
    [organizationId, caseIds],
  );
  for (const row of rows.rows) {
    const list = out.get(row.case_id) ?? [];
    list.push(toLite(row));
    out.set(row.case_id, list);
  }
  return out;
}

/** Latest open db_value_mismatch contradicted_at per case (after G3). */
async function loadContradictedAt(
  client: Db,
  organizationId: string,
  caseIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (caseIds.length === 0) return out;
  const r = await client.query<{
    case_id: string;
    contradicted_at: string | null;
    last_seen_at: Date;
  }>(
    `SELECT case_id,
            detail->>'contradicted_at' AS contradicted_at,
            last_seen_at
       FROM reconciliation_exception
      WHERE organization_id = $1
        AND case_id = ANY($2::text[])
        AND kind = 'db_value_mismatch'
        AND status <> 'resolved'
        AND (
          detail->>'contradicted_at' IS NOT NULL
          OR detail->>'reason' = 'collector_values_contradict_after_g3'
        )
      ORDER BY last_seen_at DESC`,
    [organizationId, caseIds],
  );
  for (const row of r.rows) {
    if (out.has(row.case_id)) continue;
    const at =
      row.contradicted_at?.trim() ||
      (row.last_seen_at instanceof Date
        ? row.last_seen_at.toISOString()
        : String(row.last_seen_at));
    if (at) out.set(row.case_id, at);
  }
  return out;
}

/** Provenance view per case_id (cases without receipts are absent). */
export async function loadCaseProvenance(
  client: Db,
  organizationId: string,
  caseIds: string[],
): Promise<Map<string, CaseProvenanceView>> {
  const receipts = await loadCaseReceiptsLite(client, organizationId, caseIds);
  const contradicted = await loadContradictedAt(client, organizationId, caseIds);
  const out = new Map<string, CaseProvenanceView>();
  for (const [caseId, list] of receipts) {
    const view = buildCaseProvenance(list);
    if (!view) continue;
    const at = contradicted.get(caseId);
    if (at) view.contradicted_at = at;
    out.set(caseId, view);
  }
  return out;
}

/** Provenance for the case that cites this sealed event (share link, public verify). */
export async function loadProvenanceForEvent(
  client: Db,
  organizationId: string,
  eventId: string,
): Promise<CaseProvenanceView | null> {
  const row = await client.query<{ case_id: string }>(
    `SELECT case_id
       FROM forensic_receipt
      WHERE organization_id = $1
        AND EXISTS (
          SELECT 1
            FROM jsonb_array_elements(COALESCE(body->'sealed_events', '[]'::jsonb)) se
           WHERE se->>'event_id' = $2
        )
      ORDER BY seq ASC
      LIMIT 1`,
    [organizationId, eventId],
  );
  const caseId = row.rows[0]?.case_id;
  if (!caseId) return null;
  return (await loadCaseProvenance(client, organizationId, [caseId])).get(caseId) ?? null;
}

/** Current grade of a case: seal-time grade raised by any sealed grade_change receipts. G0 if none. */
export async function getCurrentGrade(
  client: Db,
  organizationId: string,
  caseId: string,
): Promise<EvidenceGrade> {
  const view = (await loadCaseProvenance(client, organizationId, [caseId])).get(caseId);
  return view?.current_grade ?? "G0";
}

/** Rows of the grade-change index for a case (oldest first). */
export async function listGradeChanges(
  client: Db,
  organizationId: string,
  caseId: string,
): Promise<
  Array<{
    grade_change_id: string;
    from_grade: EvidenceGrade;
    to_grade: EvidenceGrade;
    reason: string;
    feed_name: string | null;
    receipt_id: string;
    receipt_hash: string;
  }>
> {
  const rows = await client.query<{
    grade_change_id: string;
    from_grade: EvidenceGrade;
    to_grade: EvidenceGrade;
    reason: string;
    feed_name: string | null;
    receipt_id: string;
    receipt_hash: string;
  }>(
    `SELECT grade_change_id, from_grade, to_grade, reason, feed_name, receipt_id, receipt_hash
       FROM evidence_grade_change
      WHERE organization_id = $1 AND case_id = $2
      ORDER BY created_at ASC, grade_change_id ASC`,
    [organizationId, caseId],
  );
  return rows.rows;
}

function sealedEventsOf(r: LiteReceipt): SealedEventRef[] {
  const raw = r.body.sealed_events;
  return Array.isArray(raw) ? (raw as SealedEventRef[]) : [];
}

export type RecordGradeChangeInput = {
  organization_id: string;
  case_id: string;
  to_grade: EvidenceGrade;
  /** Why the grade rose, in plain words (sealed into the receipt). */
  reason: string;
  /** The feed that made it possible (e.g. "Core Banking reconciliation"). */
  feed_name?: string | null;
  /** When given, must equal the case's current grade (guards against stale callers). */
  from_grade?: EvidenceGrade;
  /** Extra checks proven by this change. G2 implies `reconciled`, G3 implies `independently_captured`. */
  checks?: Partial<ProvenanceChecks>;
  issued_at?: string;
  signingKey?: { key_id: string; private_key_b64: string };
};

export type RecordGradeChangeResult = {
  grade_change_id: string;
  from_grade: EvidenceGrade;
  to_grade: EvidenceGrade;
  receipt: SignedForensicReceipt;
};

/**
 * Raise a case's evidence grade. Seals a small forensic receipt with outcome `grade_change`
 * (cites the case's sealed event, follows its latest data receipt) and indexes it in
 * `evidence_grade_change`. Grades only rise; the grade must follow from the checks.
 */
export async function recordGradeChange(
  client: Db,
  input: RecordGradeChangeInput,
): Promise<RecordGradeChangeResult> {
  const own = "release" in client ? null : await client.connect();
  const c: Db = own ?? client;
  const lockKey = `${input.organization_id}:${input.case_id}:grade`;
  try {
    await c.query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
    try {
      return await recordGradeChangeLocked(c, input);
    } finally {
      await c.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]);
    }
  } finally {
    own?.release();
  }
}

async function recordGradeChangeLocked(
  c: Db,
  input: RecordGradeChangeInput,
): Promise<RecordGradeChangeResult> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new GradeChangeError("reason_required", "A grade change must give a reason.");
  }
  const receipts =
    (
      await loadCaseReceiptsLite(c, input.organization_id, [input.case_id], {
        full: true,
      })
    ).get(input.case_id) ?? [];
  const view = buildCaseProvenance(receipts);
  if (!view) {
    throw new GradeChangeError(
      "case_not_found",
      `Case ${input.case_id} has no sealed receipt to raise.`,
    );
  }
  const from = view.current_grade;
  if (input.from_grade && input.from_grade !== from) {
    throw new GradeChangeError(
      "from_grade_mismatch",
      `Case is at ${from}, not ${input.from_grade}.`,
    );
  }
  if (gradeRank(input.to_grade) <= gradeRank(from)) {
    throw new GradeChangeError(
      "grade_must_rise",
      `A grade can only rise (currently ${from}, asked for ${input.to_grade}).`,
    );
  }
  const implied: Partial<ProvenanceChecks> =
    input.to_grade === "G3"
      ? { independently_captured: true }
      : input.to_grade === "G2"
        ? { reconciled: true }
        : {};
  const merged = mergeChecks(view.checks, implied, input.checks);
  if (gradeFromChecks(merged) !== input.to_grade) {
    throw new GradeChangeError(
      "checks_do_not_support_grade",
      `The checks support ${gradeFromChecks(merged)}, not ${input.to_grade}.`,
    );
  }

  const data = receipts.filter((r) => r.outcome !== GRADE_CHANGE_OUTCOME);
  const last = data[data.length - 1]!;
  const body = last.body as {
    product?: string;
    event_type?: string;
    mode?: "enforce" | "record_only";
    policy?: { policy_id: string; version: number; content_hash: string | null };
    matched_rules?: Array<{ rule_id: string; policy_id: string; decision: string }>;
  };
  const feed = input.feed_name?.trim() || null;
  const issued = await issueForensicReceipt(c, {
    organization_id: input.organization_id,
    case_id: input.case_id,
    decision_id: `${last.decision_id}:grade_${input.to_grade.toLowerCase()}`,
    product: body.product,
    event_type: body.event_type,
    outcome: GRADE_CHANGE_OUTCOME,
    mode: body.mode ?? "enforce",
    policy: body.policy,
    matched_rules: body.matched_rules ?? [],
    plain_summary:
      `Evidence grade rose from ${from} to ${input.to_grade}` +
      `${feed ? ` (${feed})` : ""}: ${reason}. Aegis does not check that the data is accurate.`,
    sealed_events: sealedEventsOf(last),
    attributes: {
      follows_receipt_hash: last.receipt_hash,
      follows_receipt_id: last.receipt_id,
      grade_change: {
        from_grade: from,
        to_grade: input.to_grade,
        reason,
        feed_name: feed,
        checks: merged,
      },
    },
    issued_at: input.issued_at,
    signingKey: input.signingKey,
  });

  const gradeChangeId = `gc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await c.query(
    `INSERT INTO evidence_grade_change (
       grade_change_id, organization_id, case_id, from_grade, to_grade,
       reason, feed_name, receipt_id, receipt_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      gradeChangeId,
      input.organization_id,
      input.case_id,
      from,
      input.to_grade,
      reason,
      feed,
      issued.receipt_id,
      issued.receipt_hash,
    ],
  );
  return {
    grade_change_id: gradeChangeId,
    from_grade: from,
    to_grade: input.to_grade,
    receipt: issued,
  };
}

export type { GradeChangeRecord };
