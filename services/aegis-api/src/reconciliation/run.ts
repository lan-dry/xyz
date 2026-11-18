/**
 * On-demand / scheduled reconciliation: match feed rows to receipts/tokens,
 * raise exceptions, upgrade matched cases to G2, seal a signed report.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  GradeChangeError,
  getCurrentGrade,
  recordGradeChange,
} from "../forensic/case-provenance.js";
import {
  normalizeExecutionConfig,
  type WorkflowExecutionConfig,
} from "../execution/workflow-config.js";
import type { EvidenceGrade } from "../sources/grade.js";
import { gradeRank } from "../sources/provenance.js";
import { upsertException, type ExceptionRow } from "./exceptions.js";
import { getFeed, type FeedRow } from "./ingest.js";
import { sealReconciliationReport } from "./report.js";
import type { ReconciliationReport } from "./types.js";

type Db = pg.Pool | pg.PoolClient;

export type RunInput = {
  organization_id: string;
  feed_id?: string | null;
  period_start: Date | string;
  period_end: Date | string;
  trigger: "on_demand" | "scheduled";
  created_by?: string | null;
  signingKey?: { key_id: string; private_key_b64: string };
  now?: Date;
};

export type RunResult = {
  run_id: string;
  report: ReconciliationReport;
  exceptions: ExceptionRow[];
  matched_case_ids: string[];
};

type FeedRowDb = {
  row_id: string;
  feed_id: string;
  external_id: string;
  case_id: string | null;
  token_id: string | null;
  amount: string | null;
  currency: string | null;
  beneficiary_account: string | null;
  executed_at: Date | null;
  content_hash: string;
  previous_content_hash: string | null;
  version: number;
};

type ReceiptSide = {
  case_id: string;
  token_id: string | null;
  amount: string | null;
  currency: string | null;
  beneficiary_account: string | null;
  outcome: string;
  status: string;
  case_created_at: Date;
  token_expires_at: Date | null;
  requester: string | null;
  approver: string | null;
  workflow_id: string | null;
  attributes: Record<string, unknown>;
};

function iso(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

function normAmount(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n)) return String(n);
  return t;
}

function normBene(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function attrString(
  attrs: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

async function loadFeedRows(
  client: Db,
  organizationId: string,
  feedIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<FeedRowDb[]> {
  if (feedIds.length === 0) return [];
  const r = await client.query<FeedRowDb>(
    `SELECT row_id, feed_id, external_id, case_id, token_id, amount, currency,
            beneficiary_account, executed_at, content_hash, previous_content_hash, version
       FROM reconciliation_feed_row
      WHERE organization_id = $1
        AND feed_id = ANY($2::text[])
        AND is_current
        AND (
          (executed_at IS NOT NULL AND executed_at >= $3::timestamptz AND executed_at < $4::timestamptz)
          OR (executed_at IS NULL AND ingested_at >= $3::timestamptz AND ingested_at < $4::timestamptz)
        )`,
    [organizationId, feedIds, periodStart, periodEnd],
  );
  return r.rows;
}

async function loadReceiptSides(
  client: Db,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ReceiptSide[]> {
  const cases = await client.query<{
    case_id: string;
    outcome: string | null;
    status: string;
    workflow_id: string | null;
    attributes: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT case_id, outcome, status, workflow_id, attributes, created_at
       FROM bank_case
      WHERE organization_id = $1
        AND created_at >= $2::timestamptz
        AND created_at < $3::timestamptz
        AND COALESCE(outcome, '') <> 'stop'`,
    [organizationId, periodStart, periodEnd],
  );

  // Also include stopped / expired cases that might have late executions.
  const stopped = await client.query<{
    case_id: string;
    outcome: string | null;
    status: string;
    workflow_id: string | null;
    attributes: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT case_id, outcome, status, workflow_id, attributes, created_at
       FROM bank_case
      WHERE organization_id = $1
        AND created_at >= $2::timestamptz
        AND created_at < $3::timestamptz
        AND (outcome = 'stop' OR status IN ('stopped','expired') OR outcome = 'expired')`,
    [organizationId, periodStart, periodEnd],
  );

  const byCase = new Map<string, (typeof cases.rows)[0]>();
  for (const row of [...cases.rows, ...stopped.rows]) {
    byCase.set(row.case_id, row);
  }

  const out: ReceiptSide[] = [];
  for (const row of byCase.values()) {
    const attrs =
      row.attributes && typeof row.attributes === "object"
        ? row.attributes
        : {};
    const token = await client.query<{
      token_id: string;
      expires_at: Date;
      executable_params: Record<string, unknown>;
    }>(
      `SELECT token_id, expires_at, executable_params
         FROM decision_token
        WHERE organization_id = $1 AND case_id = $2
        ORDER BY issued_at DESC
        LIMIT 1`,
      [organizationId, row.case_id],
    );
    const tok = token.rows[0];
    const params = tok?.executable_params ?? {};
    const amount =
      attrString(params, "amount") ??
      attrString(attrs, "amount", "amount_rwf", "loan_amount");
    const currency =
      attrString(params, "currency") ?? attrString(attrs, "currency");
    const beneficiary =
      attrString(params, "beneficiary_account", "beneficiary") ??
      attrString(attrs, "beneficiary_account", "beneficiary");
    const requester =
      attrString(attrs, "requester_email", "requester", "requester_name")?.toLowerCase() ??
      null;

    const vote = await client.query<{ voter_email: string | null }>(
      `SELECT v.voter_email
         FROM approval_vote v
         JOIN approval a ON a.approval_id = v.approval_id
          AND a.organization_id = v.organization_id
        WHERE v.organization_id = $1
          AND v.decision = 'approved'
          AND (
            a.event_id = $2
            OR a.metadata->>'case_id' = $2
            OR a.metadata->'attributes'->>'case_id' = $2
          )
        ORDER BY v.created_at DESC
        LIMIT 1`,
      [organizationId, row.case_id],
    ).catch(() => ({ rows: [] as Array<{ voter_email: string | null }> }));

    const approverFromAttrs = attrString(
      attrs,
      "approver_email",
      "approver",
      "approved_by",
    )?.toLowerCase();
    const approver =
      (vote.rows[0]?.voter_email?.trim().toLowerCase() || null) ??
      approverFromAttrs ??
      null;

    out.push({
      case_id: row.case_id,
      token_id: tok?.token_id ?? null,
      amount,
      currency,
      beneficiary_account: beneficiary,
      outcome: row.outcome ?? "",
      status: row.status,
      case_created_at: row.created_at,
      token_expires_at: tok?.expires_at ?? null,
      requester,
      approver,
      workflow_id: row.workflow_id,
      attributes: attrs,
    });
  }
  return out;
}

async function workflowConfigFor(
  client: Db,
  organizationId: string,
  workflowId: string | null,
): Promise<WorkflowExecutionConfig> {
  if (!workflowId) return normalizeExecutionConfig({});
  const r = await client.query<{ execution_config: unknown }>(
    `SELECT execution_config FROM governed_workflow
      WHERE organization_id = $1 AND workflow_id = $2`,
    [organizationId, workflowId],
  );
  return normalizeExecutionConfig(r.rows[0]?.execution_config);
}

export async function runReconciliation(
  client: Db,
  input: RunInput,
): Promise<RunResult> {
  const periodStart = iso(input.period_start);
  const periodEnd = iso(input.period_end);
  const now = input.now ?? new Date();
  const runId = `rr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  let feeds: FeedRow[] = [];
  if (input.feed_id) {
    const feed = await getFeed(client, input.organization_id, input.feed_id);
    if (!feed) throw new Error(`Feed ${input.feed_id} not found`);
    feeds = [feed];
  } else {
    const all = await client.query<FeedRow>(
      `SELECT feed_id, organization_id, name, source_id, match_key, column_mapping,
              expected_interval_sec, schedule_enabled, schedule_hour_utc,
              last_scheduled_at, status
         FROM reconciliation_feed
        WHERE organization_id = $1 AND status = 'active'`,
      [input.organization_id],
    );
    feeds = all.rows;
  }

  await client.query(
    `INSERT INTO reconciliation_run (
       run_id, organization_id, feed_id, trigger, period_start, period_end,
       status, created_by, started_at
     ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,'running',$7,$8::timestamptz)`,
    [
      runId,
      input.organization_id,
      feeds.length === 1 ? feeds[0]!.feed_id : null,
      input.trigger,
      periodStart,
      periodEnd,
      input.created_by ?? null,
      now.toISOString(),
    ],
  );

  const exceptions: ExceptionRow[] = [];
  const matchedCaseIds: string[] = [];
  let matchedCount = 0;
  let unmatchedFeed = 0;
  let unmatchedReceipt = 0;

  try {
    const feedIds = feeds.map((f) => f.feed_id);
    const feedById = new Map(feeds.map((f) => [f.feed_id, f]));
    const rows = await loadFeedRows(
      client,
      input.organization_id,
      feedIds,
      periodStart,
      periodEnd,
    );
    const receipts = await loadReceiptSides(
      client,
      input.organization_id,
      periodStart,
      periodEnd,
    );

    const receiptByCase = new Map(receipts.map((r) => [r.case_id, r]));
    const receiptByToken = new Map(
      receipts.filter((r) => r.token_id).map((r) => [r.token_id!, r]),
    );
    const matchedReceiptKeys = new Set<string>();

    for (const row of rows) {
      const feed = feedById.get(row.feed_id)!;
      const matchKey = feed.match_key;
      let side: ReceiptSide | undefined;
      if (matchKey === "token_id" && row.token_id) {
        side = receiptByToken.get(row.token_id);
      } else if (matchKey === "case_id" && row.case_id) {
        side = receiptByCase.get(row.case_id);
      }
      if (!side && row.case_id) side = receiptByCase.get(row.case_id);
      if (!side && row.token_id) side = receiptByToken.get(row.token_id);

      if (!side) {
        unmatchedFeed++;
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "executed_without_receipt",
          run_id: runId,
          case_id: row.case_id,
          token_id: row.token_id,
          feed_id: row.feed_id,
          feed_row_id: row.row_id,
          source_name: feed.name,
          fingerprint_key: row.external_id,
          detail: {
            external_id: row.external_id,
            amount: row.amount,
            beneficiary_account: row.beneficiary_account,
          },
        });
        exceptions.push(exception);
        continue;
      }

      matchedReceiptKeys.add(side.case_id);

      // After-the-fact edit: prior content hash existed (version > 1).
      // Compare amounts / beneficiary against the receipt.

      const feedAmount = normAmount(row.amount);
      const sideAmount = normAmount(side.amount);
      const feedBene = normBene(row.beneficiary_account);
      const sideBene = normBene(side.beneficiary_account);

      let fieldMismatch = false;
      if (
        feedAmount != null &&
        sideAmount != null &&
        feedAmount !== sideAmount
      ) {
        fieldMismatch = true;
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "amount_mismatch",
          run_id: runId,
          case_id: side.case_id,
          token_id: side.token_id,
          feed_id: row.feed_id,
          feed_row_id: row.row_id,
          source_name: feed.name,
          fingerprint_key: `${side.case_id}:amount`,
          detail: {
            feed_amount: feedAmount,
            receipt_amount: sideAmount,
            previous_content_hash: row.previous_content_hash,
            version: row.version,
          },
        });
        exceptions.push(exception);
      }

      if (feedBene != null && sideBene != null && feedBene !== sideBene) {
        fieldMismatch = true;
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "beneficiary_mismatch",
          run_id: runId,
          case_id: side.case_id,
          token_id: side.token_id,
          feed_id: row.feed_id,
          feed_row_id: row.row_id,
          source_name: feed.name,
          fingerprint_key: `${side.case_id}:beneficiary`,
          detail: {
            feed_beneficiary: feedBene,
            receipt_beneficiary: sideBene,
            previous_content_hash: row.previous_content_hash,
            version: row.version,
          },
        });
        exceptions.push(exception);
      }

      const executedAt = row.executed_at;
      if (
        executedAt &&
        (side.outcome === "stop" || side.status === "stopped")
      ) {
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "executed_after_stop",
          run_id: runId,
          case_id: side.case_id,
          token_id: side.token_id,
          feed_id: row.feed_id,
          feed_row_id: row.row_id,
          source_name: feed.name,
          fingerprint_key: side.case_id,
          detail: { executed_at: executedAt.toISOString() },
        });
        exceptions.push(exception);
      }

      if (
        executedAt &&
        side.token_expires_at &&
        executedAt.getTime() > side.token_expires_at.getTime()
      ) {
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "executed_after_expiry",
          run_id: runId,
          case_id: side.case_id,
          token_id: side.token_id,
          feed_id: row.feed_id,
          feed_row_id: row.row_id,
          source_name: feed.name,
          fingerprint_key: side.token_id ?? side.case_id,
          detail: {
            executed_at: executedAt.toISOString(),
            expires_at: side.token_expires_at.toISOString(),
          },
        });
        exceptions.push(exception);
      }

      if (!fieldMismatch && side.outcome !== "stop" && side.status !== "stopped") {
        matchedCount++;
        matchedCaseIds.push(side.case_id);
        const corroboratedAt = now.toISOString();
        const reason = `corroborated by ${feed.name} on ${corroboratedAt}`;
        try {
          const current = await getCurrentGrade(
            client,
            input.organization_id,
            side.case_id,
          );
          if (gradeRank(current) < gradeRank("G2")) {
            await recordGradeChange(client, {
              organization_id: input.organization_id,
              case_id: side.case_id,
              to_grade: "G2",
              reason,
              feed_name: feed.name,
              checks: { execution_matched: true, reconciled: true },
              issued_at: corroboratedAt,
              signingKey: input.signingKey,
            });
          } else {
            // Already G2+: still record checks via a no-op path is not possible;
            // leave grade. Match still counts.
          }
        } catch (err) {
          if (!(err instanceof GradeChangeError)) throw err;
          // grade_must_rise / case_not_found: skip upgrade, keep match count.
        }
      }
    }

    // Receipts with allow/approved expectation but no feed row.
    // Only on org-wide runs (all feeds): a single-feed run must not flag
    // unrelated cases that belong to another ledger.
    if (!input.feed_id) {
      const anyFeedMatch = new Set<string>();
      for (const row of rows) {
        if (row.case_id) anyFeedMatch.add(row.case_id);
      }
      for (const side of receipts) {
        if (matchedReceiptKeys.has(side.case_id) || anyFeedMatch.has(side.case_id)) {
          continue;
        }
        if (side.outcome === "stop" || side.status === "stopped") continue;
        if (
          side.outcome === "hold" ||
          side.status === "held" ||
          side.status === "open"
        ) {
          continue;
        }
        if (
          side.outcome !== "allow" &&
          side.status !== "approved" &&
          side.outcome !== "approved"
        ) {
          continue;
        }
        unmatchedReceipt++;
        const { exception } = await upsertException(client, {
          organization_id: input.organization_id,
          kind: "receipt_without_execution",
          run_id: runId,
          case_id: side.case_id,
          token_id: side.token_id,
          feed_id: null,
          source_name: "reconciliation",
          fingerprint_key: side.case_id,
          detail: { outcome: side.outcome, status: side.status },
        });
        exceptions.push(exception);
      }
    }

    // Approver same as requester.
    for (const side of receipts) {
      if (!side.requester || !side.approver) continue;
      if (side.requester !== side.approver) continue;
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "approver_same_as_requester",
        run_id: runId,
        case_id: side.case_id,
        token_id: side.token_id,
        source_name: "approvals",
        fingerprint_key: side.case_id,
        detail: { requester: side.requester, approver: side.approver },
      });
      exceptions.push(exception);
    }

    // Sequence gaps from source registry (scoped to feeds in this run when possible).
    const linkedSourceIds = feeds
      .map((f) => f.source_id)
      .filter((id): id is string => Boolean(id));
    const gaps = await client.query<{
      source_id: string;
      from_seq: string;
      to_seq: string;
    }>(
      linkedSourceIds.length > 0
        ? `SELECT source_id, from_seq::text, to_seq::text
             FROM source_sequence_gap
            WHERE organization_id = $1
              AND source_id = ANY($4::text[])
              AND detected_at >= $2::timestamptz
              AND detected_at < $3::timestamptz`
        : `SELECT source_id, from_seq::text, to_seq::text
             FROM source_sequence_gap
            WHERE organization_id = $1
              AND detected_at >= $2::timestamptz
              AND detected_at < $3::timestamptz`,
      linkedSourceIds.length > 0
        ? [input.organization_id, periodStart, periodEnd, linkedSourceIds]
        : [input.organization_id, periodStart, periodEnd],
    );
    for (const gap of gaps.rows) {
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "sequence_gap",
        run_id: runId,
        source_name: gap.source_id,
        fingerprint_key: `${gap.source_id}:${gap.from_seq}:${gap.to_seq}`,
        detail: {
          source_id: gap.source_id,
          from_seq: Number(gap.from_seq),
          to_seq: Number(gap.to_seq),
        },
      });
      exceptions.push(exception);
    }

    // Source silent: feed.expected_interval or source.expected_interval_sec.
    for (const feed of feeds) {
      const interval =
        feed.expected_interval_sec ??
        (
          await client.query<{ expected_interval_sec: number | null }>(
            `SELECT expected_interval_sec FROM source
              WHERE organization_id = $1 AND source_id = $2`,
            [input.organization_id, feed.source_id],
          ).catch(() => ({ rows: [] as Array<{ expected_interval_sec: number | null }> }))
        ).rows[0]?.expected_interval_sec ??
        null;
      if (!interval || !feed.source_id) continue;
      const src = await client.query<{ last_event_at: Date | null; name: string }>(
        `SELECT last_event_at, name FROM source
          WHERE organization_id = $1 AND source_id = $2`,
        [input.organization_id, feed.source_id],
      );
      const last = src.rows[0]?.last_event_at;
      const silent =
        !last || now.getTime() - last.getTime() > interval * 1000;
      if (!silent) continue;
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "source_silent",
        run_id: runId,
        feed_id: feed.feed_id,
        source_name: src.rows[0]?.name ?? feed.name,
        fingerprint_key: feed.source_id,
        detail: {
          source_id: feed.source_id,
          expected_interval_sec: interval,
          last_event_at: last?.toISOString() ?? null,
        },
      });
      exceptions.push(exception);
    }

    // Below required grade past deadline.
    for (const side of receipts) {
      const cfg = await workflowConfigFor(
        client,
        input.organization_id,
        side.workflow_id,
      );
      const required = cfg.required_grade;
      if (!required) continue;
      if (cfg.on_missing !== "exception") continue;
      const deadlineHours = cfg.grade_deadline_hours ?? 24;
      const deadlineMs =
        side.case_created_at.getTime() + deadlineHours * 3600 * 1000;
      if (now.getTime() < deadlineMs) continue;
      const current = await getCurrentGrade(
        client,
        input.organization_id,
        side.case_id,
      );
      if (gradeRank(current) >= gradeRank(required as EvidenceGrade)) continue;
      const { exception } = await upsertException(client, {
        organization_id: input.organization_id,
        kind: "below_required_grade_past_deadline",
        run_id: runId,
        case_id: side.case_id,
        token_id: side.token_id,
        source_name: "workflow",
        fingerprint_key: side.case_id,
        detail: {
          current_grade: current,
          required_grade: required,
          deadline_hours: deadlineHours,
          on_missing: cfg.on_missing,
        },
      });
      exceptions.push(exception);
    }

    // Deduplicate exception list by exception_id for the report.
    const unique = new Map(exceptions.map((e) => [e.exception_id, e]));
    const uniqueList = [...unique.values()];

    const reportBase: ReconciliationReport = {
      run_id: runId,
      organization_id: input.organization_id,
      feed_id: feeds.length === 1 ? feeds[0]!.feed_id : null,
      feed_name: feeds.length === 1 ? feeds[0]!.name : null,
      period_start: periodStart,
      period_end: periodEnd,
      trigger: input.trigger,
      matched_count: matchedCount,
      unmatched_feed_count: unmatchedFeed,
      unmatched_receipt_count: unmatchedReceipt,
      exception_count: uniqueList.length,
      exceptions: uniqueList.map((e) => ({
        exception_id: e.exception_id,
        kind: e.kind,
        severity: e.severity,
        title: e.title,
        case_id: e.case_id,
        source_name: e.source_name,
        status: e.status,
      })),
      sealed_at: now.toISOString(),
    };

    const { report } = await sealReconciliationReport(client, reportBase, {
      signingKey: input.signingKey,
    });

    await client.query(
      `UPDATE reconciliation_run
          SET status = 'completed',
              matched_count = $2,
              unmatched_feed_count = $3,
              unmatched_receipt_count = $4,
              exception_count = $5,
              finished_at = $6::timestamptz
        WHERE run_id = $1`,
      [
        runId,
        matchedCount,
        unmatchedFeed,
        unmatchedReceipt,
        uniqueList.length,
        new Date().toISOString(),
      ],
    );

    if (input.trigger === "scheduled") {
      for (const feed of feeds) {
        await client.query(
          `UPDATE reconciliation_feed
              SET last_scheduled_at = $2::timestamptz, updated_at = now()
            WHERE feed_id = $1`,
          [feed.feed_id, now.toISOString()],
        );
      }
    }

    return {
      run_id: runId,
      report,
      exceptions: uniqueList,
      matched_case_ids: matchedCaseIds,
    };
  } catch (err) {
    await client.query(
      `UPDATE reconciliation_run
          SET status = 'failed', error = $2, finished_at = now()
        WHERE run_id = $1`,
      [runId, err instanceof Error ? err.message : String(err)],
    );
    throw err;
  }
}

export async function getRun(
  client: Db,
  organizationId: string,
  runId: string,
): Promise<{
  run_id: string;
  organization_id: string;
  feed_id: string | null;
  trigger: string;
  period_start: Date;
  period_end: Date;
  status: string;
  matched_count: number;
  unmatched_feed_count: number;
  unmatched_receipt_count: number;
  exception_count: number;
  report: ReconciliationReport | null;
  report_receipt_id: string | null;
  report_receipt_hash: string | null;
  error: string | null;
  created_by: string | null;
  started_at: Date;
  finished_at: Date | null;
} | null> {
  const r = await client.query<{
    run_id: string;
    organization_id: string;
    feed_id: string | null;
    trigger: string;
    period_start: Date;
    period_end: Date;
    status: string;
    matched_count: number;
    unmatched_feed_count: number;
    unmatched_receipt_count: number;
    exception_count: number;
    report: ReconciliationReport | null;
    report_receipt_id: string | null;
    report_receipt_hash: string | null;
    error: string | null;
    created_by: string | null;
    started_at: Date;
    finished_at: Date | null;
  }>(
    `SELECT * FROM reconciliation_run
      WHERE organization_id = $1 AND run_id = $2`,
    [organizationId, runId],
  );
  return r.rows[0] ?? null;
}

export async function listRuns(
  client: Db,
  organizationId: string,
  limit = 50,
): Promise<
  Array<{
    run_id: string;
    feed_id: string | null;
    trigger: string;
    period_start: Date;
    period_end: Date;
    status: string;
    matched_count: number;
    unmatched_feed_count: number;
    unmatched_receipt_count: number;
    exception_count: number;
    started_at: Date;
    finished_at: Date | null;
  }>
> {
  const r = await client.query(
    `SELECT run_id, feed_id, trigger, period_start, period_end, status,
            matched_count, unmatched_feed_count, unmatched_receipt_count,
            exception_count, started_at, finished_at
       FROM reconciliation_run
      WHERE organization_id = $1
      ORDER BY started_at DESC
      LIMIT $2`,
    [organizationId, limit],
  );
  return r.rows;
}
