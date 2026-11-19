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
import { listBankRoleLadder } from "../bank/repo.js";
import { roleDisplayName } from "../bank/rule-preview.js";
import {
  issueForensicReceipt,
} from "./issue.js";
import { loadCaseReceiptsLite } from "./case-provenance.js";
import {
  buildCaseProvenance,
  buildFieldAssertions,
  buildProvenanceBlock,
} from "../sources/provenance.js";
import { nowIso } from "../time/clock.js";
import { issueDecisionToken } from "../execution/decision-token.js";
import { resolveExecutionConfigForCase } from "../execution/workflow-config.js";
import type {
  ForensicReceiptBody,
  SealedEventRef,
  SignedForensicReceipt,
} from "./receipt.js";
import type { DecisionToken } from "@salanor/aegis-sdk";
import type { ApproverBinding } from "../approvals/approver-binding.js";
import { hashApprovedViewFromEventPayload } from "../approvals/approver-binding.js";

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
    /**
     * Hash of the exact request preview the approver saw. When omitted, derived
     * from eventPayload (same canonical preview the console renders).
     */
    approved_view_hash?: string | null;
    /**
     * How the approved view was confirmed. When the client omitted the hash,
     * seal "server-rendered, not confirmed by approver".
     */
    view_confirmation?:
      | "confirmed_by_approver"
      | "server-rendered, not confirmed by approver"
      | null;
    /** Authenticated identity bound into the sealed approval (Stage 5 / A1). */
    approver_binding?: ApproverBinding | null;
    /**
     * All per-approver bindings for multi-person approvals (each vote bound
     * separately). When present, preferred over a single approver_binding.
     */
    approver_bindings?: ApproverBinding[] | null;
    /** Optional software key override for tests. */
    signingKey?: { key_id: string; private_key_b64: string };
    /**
     * Fraud-block override path: seal score, version, label, and that this
     * was a hard-stop release (approver ≠ requester enforced upstream).
     */
    fraud_block_override?: {
      model_score: number | null;
      model_version: string | null;
      model_score_label: string;
      release_reason: string;
      requester_email: string | null;
    } | null;
  },
): Promise<(SignedForensicReceipt & { decision_token?: DecisionToken }) | null> {
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
  const ladder = await listBankRoleLadder(client, input.organizationId);
  const roleLabel =
    roleDisplayName(ladder, roleKey) ?? formatRoleLabel(roleKey);
  const displayName =
    input.approver.display_name?.trim() ||
    input.delegation?.delegate.name ||
    input.approver.email;
  const requester = extractRequester(
    input.eventPayload ??
      (prior.body.attributes as Record<string, unknown> | undefined),
  );
  const priorAttrsRaw =
    prior.body.attributes && typeof prior.body.attributes === "object"
      ? (prior.body.attributes as Record<string, unknown>)
      : {};
  const { demo_history: _demoHistory, ...priorAttrs } = priorAttrsRaw;
  const holdRequiredRole =
    typeof priorAttrs.required_role === "string"
      ? priorAttrs.required_role
      : null;
  const holdRequiredLabel =
    (typeof prior.body.attributes?.required_role_label === "string"
      ? prior.body.attributes.required_role_label
      : null) ??
    roleDisplayName(ladder, holdRequiredRole) ??
    formatRoleLabel(holdRequiredRole);

  const sealed_events: SealedEventRef[] = [
    ...(prior.body.sealed_events ?? []),
    {
      event_id: input.humanEventId,
      event_hash: input.humanEventHash,
      sequence_num: input.humanEventSeq,
    },
  ];

  const approvedViewHash =
    input.approved_view_hash?.trim() ||
    hashApprovedViewFromEventPayload(input.eventPayload ?? null);
  const approverBindings =
    input.approver_bindings && input.approver_bindings.length > 0
      ? input.approver_bindings
      : input.approver_binding
        ? [input.approver_binding]
        : [];
  const approverBinding = approverBindings[approverBindings.length - 1] ?? null;
  const viewConfirmation =
    input.view_confirmation ??
    "server-rendered, not confirmed by approver";

  const approvalRecord = {
    approval_id: input.approvalId,
    decision: input.outcome,
    approver_user_id: input.approver.user_id,
    approver_display_name: displayName,
    approver_role: roleKey,
    approver_role_label: roleLabel,
    approver_email: input.approver.email,
    approved_view_hash: approvedViewHash,
    view_confirmation: viewConfirmation,
    ...(approverBinding ? { approver_binding: approverBinding } : {}),
    ...(approverBindings.length > 1
      ? { approver_bindings: approverBindings }
      : {}),
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
    ...(input.fraud_block_override
      ? {
          fraud_block_override: true,
          model_score: input.fraud_block_override.model_score,
          model_version: input.fraud_block_override.model_version,
          model_score_label: input.fraud_block_override.model_score_label,
          release_reason: input.fraud_block_override.release_reason,
          override_requester_email:
            input.fraud_block_override.requester_email,
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
  // Same sentence as the case page: amount, rule, approver, reason.
  // Hold's required role (not acting role) for "requires a Credit Manager".
  const plain = describeDecision({
    outcome:
      input.outcome === "declined"
        ? "declined"
        : input.outcome === "approved"
          ? "approved"
          : "released",
    product: prior.body.product ?? null,
    event_type: prior.body.event_type ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    policy_version: prior.body.policy?.version ?? null,
    matched_rules: prior.body.matched_rules ?? [],
    decision_basis: (prior.body.decision_basis ??
      null) as Parameters<typeof describeDecision>[0]["decision_basis"],
    decided_by_rule_id: prior.body.decision_basis?.decided_by_rule_id ?? null,
    required_role_label: holdRequiredLabel ?? roleLabel,
    required_role: holdRequiredRole ?? roleKey,
    approver_name: displayName,
    approver_role: roleKey,
    approved_at: input.decided_at,
    approval_reason: input.reason ?? null,
  });

  // Stage 2: the human decision inherits where the DATA came from (and any grade rise since),
  // and adds that Aegis itself bound the approver to the decision.
  const caseReceipts =
    (await loadCaseReceiptsLite(client, input.organizationId, [prior.case_id])).get(
      prior.case_id,
    ) ?? [];
  const caseView = buildCaseProvenance(caseReceipts);
  const provenance = buildProvenanceBlock({
    source_id: caseView?.source?.source_id ?? "unlabelled",
    source_name:
      caseView?.source?.source_name ??
      "Source not labelled (sealed before labelling)",
    source_key_id: caseView?.source?.key_id ?? null,
    authentication: caseView?.source?.authentication ?? "bearer_key",
    checks: { ...(caseView?.checks ?? {}), approver_bound: true },
    field_assertions: {
      ...(caseView?.field_assertions ?? {}),
      ...buildFieldAssertions(
        [
          "approver_user_id",
          "approver_display_name",
          "approver_role",
          "approver_role_label",
          "approval_reason",
          "approved_view_hash",
          "approver_binding",
        ],
        {
          derivedKeys: [
            "approver_user_id",
            "approver_display_name",
            "approver_role",
            "approver_role_label",
            "approval_reason",
            "approved_view_hash",
            "approver_binding",
          ],
        },
      ),
    },
    recorded_at: nowIso(),
  });

  const receipt = await issueForensicReceipt(client, {
    organization_id: input.organizationId,
    case_id: prior.case_id,
    decision_id: `${prior.decision_id}:${input.outcome}`,
    provenance,
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
    issued_at: input.decided_at,
    attributes: {
      ...priorAttrs,
      follows_receipt_hash: prior.receipt_hash,
      follows_receipt_id: prior.receipt_id,
      approval_id: input.approvalId,
      approval_decision: input.outcome,
      approver_user_id: input.approver.user_id,
      approver_display_name: displayName,
      approver_role: roleKey,
      approver_role_label: roleLabel,
      approved_view_hash: approvedViewHash,
      view_confirmation: viewConfirmation,
      ...(approverBinding ? { approver_binding: approverBinding } : {}),
      ...(approverBindings.length > 1
        ? { approver_bindings: approverBindings }
        : {}),
      approval_reason: input.reason ?? null,
      requester: requester.label,
      requester_email: requester.email,
      requester_officer_id: requester.officer_id,
      requester_name: requester.name,
      requester_role: requester.role,
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

  if (input.outcome !== "approved") {
    return receipt;
  }

  let decision_token: DecisionToken | undefined;
  try {
    const execConfig = await resolveExecutionConfigForCase(
      client,
      input.organizationId,
      {
        case_id: prior.case_id,
        product: prior.body.product ?? null,
      },
    );
    const tokenAttrs: Record<string, unknown> = {
      ...priorAttrs,
      ...(prior.body.product ? { product: prior.body.product } : {}),
    };
    if (
      tokenAttrs.beneficiary_account == null &&
      tokenAttrs.beneficiary != null
    ) {
      tokenAttrs.beneficiary_account = tokenAttrs.beneficiary;
    }
    const issued = await issueDecisionToken(client, {
      organizationId: input.organizationId,
      caseId: prior.case_id,
      decisionId: `${prior.decision_id}:approved`,
      attributes: tokenAttrs,
      config: execConfig,
      signingKey: input.signingKey,
    });
    if (issued) decision_token = issued;
  } catch (err) {
    console.error(
      "[approval] decision token issue failed",
      err instanceof Error ? err.message : err,
    );
  }

  return decision_token ? { ...receipt, decision_token } : receipt;
}
