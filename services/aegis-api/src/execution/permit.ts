/**
 * In-path execution permit: the core ledger asks Aegis whether a proposed
 * action may complete. Answers from sealed forensic receipts only — no new
 * crypto. Deny when the case is still held, declined, stopped, missing, or
 * the action digest no longer matches what was sealed / approved.
 */
import type pg from "pg";
import {
  actionSnapshotFromPayload,
  approvedActionMatches,
} from "../approvals/action-digest.js";

export type ExecutionPermitInput = {
  case_id?: string | null;
  trace_id?: string | null;
  action?: Record<string, unknown> | null;
};

export type ExecutionPermitResult = {
  permitted: boolean;
  reason: string;
  code:
    | "permitted"
    | "missing_locator"
    | "not_found"
    | "held"
    | "declined"
    | "stopped"
    | "digest_mismatch"
    | "no_executable_outcome";
  receipt_id?: string;
  receipt_hash?: string;
  outcome?: string;
  case_id?: string;
};

type ReceiptRow = {
  receipt_id: string;
  receipt_hash: string;
  case_id: string;
  outcome: string;
  body: Record<string, unknown>;
  seq: string | number;
};

const EXECUTABLE = new Set(["allow", "approved", "released"]);

async function resolveCaseId(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  input: ExecutionPermitInput,
): Promise<string | null> {
  const caseId = input.case_id?.trim() || null;
  if (caseId) return caseId;
  const traceId = input.trace_id?.trim() || null;
  if (!traceId) return null;
  const row = await client.query<{ case_id: string }>(
    `SELECT case_id
     FROM bank_case
     WHERE organization_id = $1 AND trace_id = $2
     LIMIT 1`,
    [organizationId, traceId],
  );
  return row.rows[0]?.case_id ?? null;
}

async function listCaseReceipts(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  caseId: string,
): Promise<ReceiptRow[]> {
  const result = await client.query<ReceiptRow>(
    `SELECT receipt_id, receipt_hash, case_id, outcome, body, seq
     FROM forensic_receipt
     WHERE organization_id = $1 AND case_id = $2
     ORDER BY seq ASC`,
    [organizationId, caseId],
  );
  return result.rows.map((r) => ({
    ...r,
    body:
      r.body && typeof r.body === "object" && !Array.isArray(r.body)
        ? (r.body as Record<string, unknown>)
        : {},
  }));
}

function sealedActionSnapshot(body: Record<string, unknown>): Record<string, unknown> {
  const attrs =
    body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)
      ? (body.attributes as Record<string, unknown>)
      : {};
  const approvals = Array.isArray(body.approvals) ? body.approvals : [];
  const firstApproval =
    approvals[0] && typeof approvals[0] === "object" && !Array.isArray(approvals[0])
      ? (approvals[0] as Record<string, unknown>)
      : null;
  // Prefer attributes sealed on the receipt; fall back to approval record fields.
  return actionSnapshotFromPayload({
    ...attrs,
    ...(firstApproval ?? {}),
  });
}

/**
 * Decide whether the proposed action may execute for this org.
 * Pure over sealed receipts — does not mint a new attestation.
 */
export async function evaluateExecutionPermit(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  input: ExecutionPermitInput,
): Promise<ExecutionPermitResult> {
  const caseId = await resolveCaseId(client, organizationId, input);
  if (!caseId) {
    return {
      permitted: false,
      reason: "case_id or trace_id is required",
      code: "missing_locator",
    };
  }

  const receipts = await listCaseReceipts(client, organizationId, caseId);
  if (receipts.length === 0) {
    return {
      permitted: false,
      reason: `No sealed receipt for case ${caseId}`,
      code: "not_found",
      case_id: caseId,
    };
  }

  // Latest receipt by seq is authoritative for current state.
  const latest = receipts[receipts.length - 1]!;
  const outcome = String(latest.outcome ?? "").toLowerCase();

  if (outcome === "hold") {
    return {
      permitted: false,
      reason: "Case is still held — human approval required before execution",
      code: "held",
      receipt_id: latest.receipt_id,
      receipt_hash: latest.receipt_hash,
      outcome,
      case_id: caseId,
    };
  }
  if (outcome === "declined" || outcome === "rejected") {
    return {
      permitted: false,
      reason: "Case was declined — execution refused",
      code: "declined",
      receipt_id: latest.receipt_id,
      receipt_hash: latest.receipt_hash,
      outcome,
      case_id: caseId,
    };
  }
  if (outcome === "stop") {
    return {
      permitted: false,
      reason: "Case was stopped by policy — execution refused",
      code: "stopped",
      receipt_id: latest.receipt_id,
      receipt_hash: latest.receipt_hash,
      outcome,
      case_id: caseId,
    };
  }
  if (!EXECUTABLE.has(outcome)) {
    return {
      permitted: false,
      reason: `Outcome "${outcome}" is not executable`,
      code: "no_executable_outcome",
      receipt_id: latest.receipt_id,
      receipt_hash: latest.receipt_hash,
      outcome,
      case_id: caseId,
    };
  }

  const sealedSnapshot = sealedActionSnapshot(latest.body);
  const proposed = input.action ?? {};
  // If the sealed receipt has bindable fields, the proposed action must match them.
  if (Object.keys(sealedSnapshot).length > 0) {
    const { match } = approvedActionMatches(sealedSnapshot, proposed);
    if (!match) {
      return {
        permitted: false,
        reason:
          "Proposed action does not match the sealed decision (amount/beneficiary/digest mismatch)",
        code: "digest_mismatch",
        receipt_id: latest.receipt_id,
        receipt_hash: latest.receipt_hash,
        outcome,
        case_id: caseId,
      };
    }
  }

  return {
    permitted: true,
    reason: `Permitted under sealed ${outcome}`,
    code: "permitted",
    receipt_id: latest.receipt_id,
    receipt_hash: latest.receipt_hash,
    outcome,
    case_id: caseId,
  };
}
