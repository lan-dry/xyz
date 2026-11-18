/**
 * A1 — second forensic receipt after a human decision.
 * Cites the hold/stop receipt hash explicitly (follows_receipt_hash) and
 * seals approver identity, role, reason, requester, and decision time.
 */

import type pg from "pg";
import {
  describeDecision,
  formatApprover,
  formatRoleLabel,
} from "../bank/describe-decision.js";
import { extractRequester } from "../bank/requester.js";
import type { DelegationRecord } from "../bank/approval-delegate.js";
import {
  issueForensicReceipt,
} from "./issue.js";
import type {
  ForensicReceiptBody,
  SealedEventRef,
  SignedForensicReceipt,
} from "./receipt.js";

export type ApprovalOutcome = "approved" | "declined" | "released";

export type PriorReceiptRow = {
  receipt_id: string;
  receipt_hash: string;
  case_id: string;
  decision_id: string;
  outcome: string;
  body: ForensicReceiptBody;
};

/** Hold or stop receipt that the human decision follows (same gate event / case). */
export async function findPriorHoldOrStopReceipt(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  gateEventId: string,
): Promise<PriorReceiptRow | null> {
  const result = await client.query<{
    receipt_id: string;
    receipt_hash: string;
    case_id: string;
    decision_id: string;
    outcome: string;
    body: ForensicReceiptBody;
  }>(
    `SELECT receipt_id, receipt_hash, case_id, decision_id, outcome, body
       FROM forensic_receipt
      WHERE organization_id = $1
        AND outcome IN ('hold', 'stop')
        AND EXISTS (
          SELECT 1
            FROM jsonb_array_elements(body->'sealed_events') se
           WHERE se->>'event_id' = $2
        )
      ORDER BY seq ASC
      LIMIT 1`,
    [organizationId, gateEventId],
  );
  return result.rows[0] ?? null;
}

export async function issueApprovalOutcomeReceipt(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    approvalId: string;
    outcome: ApprovalOutcome;
    gateEventId: string;
    humanEventId: string;
    humanEventHash: string;
    humanEventSeq: number;
    approver: {
      user_id: string;
      display_name: string | null;
      email: string;
      role: string | null;
    };
    reason?: string | null;
    reason_code?: string | null;
    decided_at: string;
    eventPayload?: Record<string, unknown> | null;
    delegation?: DelegationRecord | null;
    /** Optional software key override for tests. */
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<SignedForensicReceipt | null> {
  const prior = await findPriorHoldOrStopReceipt(
    client,
    input.organizationId,
    input.gateEventId,
  );
  if (!prior) {
    // No prior hold/stop receipt — nothing to chain. Do not invent one.
    return null;
  }

  const roleKey =
    input.delegation?.role_key ??
    input.approver.role ??
    null;
  const roleLabel = formatRoleLabel(roleKey);
  const displayName =
    input.approver.display_name?.trim() ||
    input.delegation?.delegate.name ||
    input.approver.email;
  const requester = extractRequester(input.eventPayload);

  const sealed_events: SealedEventRef[] = [
    ...(prior.body.sealed_events ?? []),
    {
      event_id: input.humanEventId,
      event_hash: input.humanEventHash,
      sequence_num: input.humanEventSeq,
    },
  ];

  const approvalRecord = {
    approval_id: input.approvalId,
    decision: input.outcome,
    approver_user_id: input.approver.user_id,
    approver_display_name: displayName,
    approver_role: roleKey,
    approver_role_label: roleLabel,
    approver_email: input.approver.email,
    reason: input.reason ?? null,
    reason_code: input.reason_code ?? null,
    decided_at: input.decided_at,
    requester_email: requester.email,
    requester_officer_id: requester.officer_id,
    requester: requester.label,
    follows_receipt_id: prior.receipt_id,
    follows_receipt_hash: prior.receipt_hash,
    ...(input.delegation
      ? {
          acting_under_delegation: {
            delegate_id: input.delegation.delegate_id,
            role_key: input.delegation.role_key,
            acted_by: input.delegation.delegate,
            delegated_by: input.delegation.delegator,
            expires_at: input.delegation.expires_at,
          },
        }
      : {}),
  };

  const attrs =
    prior.body.attributes && typeof prior.body.attributes === "object"
      ? (prior.body.attributes as Record<string, unknown>)
      : {};
  const amountRaw = attrs.amount ?? attrs.amount_rwf ?? attrs.loan_amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim() !== ""
        ? Number(amountRaw)
        : null;
  const currency = typeof attrs.currency === "string" ? attrs.currency : null;
  // Same sentence as the case page: amount, rule, approver, reason (A4).
  const plain = describeDecision({
    outcome: input.outcome === "declined" ? "declined" : "released",
    product: prior.body.product ?? null,
    event_type: prior.body.event_type ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    policy_version: prior.body.policy?.version ?? null,
    matched_rules: prior.body.matched_rules ?? [],
    decision_basis: (prior.body.decision_basis ??
      null) as Parameters<typeof describeDecision>[0]["decision_basis"],
    decided_by_rule_id: prior.body.decision_basis?.decided_by_rule_id ?? null,
    required_role_label: roleLabel,
    required_role: roleKey,
    approver_name: displayName,
    approver_role: roleKey,
    approved_at: input.decided_at,
    approval_reason: input.reason ?? null,
  });

  return issueForensicReceipt(client, {
    organization_id: input.organizationId,
    case_id: prior.case_id,
    decision_id: `${prior.decision_id}:${input.outcome}`,
    product: prior.body.product,
    event_type: prior.body.event_type,
    outcome: input.outcome,
    mode: prior.body.mode ?? "enforce",
    would_have: prior.body.would_have,
    policy: prior.body.policy,
    matched_rules: prior.body.matched_rules ?? [],
    decision_basis: prior.body.decision_basis,
    plain_summary: plain,
    sealed_events,
    attributes: {
      ...(prior.body.attributes ?? {}),
      follows_receipt_hash: prior.receipt_hash,
      follows_receipt_id: prior.receipt_id,
      approval_id: input.approvalId,
      approval_decision: input.outcome,
      approver_user_id: input.approver.user_id,
      approver_display_name: displayName,
      approver_role: roleKey,
      approval_reason: input.reason ?? null,
      requester: requester.label,
      requester_email: requester.email,
    },
    timeline: [
      ...(prior.body.timeline ?? []),
      {
        at: input.decided_at,
        kind: "human_decision",
        outcome: input.outcome,
        by: formatApprover(displayName, roleKey) ?? displayName,
      },
    ],
    approvals: [approvalRecord],
    flags: prior.body.flags
      ? {
          decided_without_aegis: prior.body.flags.decided_without_aegis,
          provisional: prior.body.flags.provisional,
        }
      : undefined,
    signingKey: input.signingKey,
  });
}
