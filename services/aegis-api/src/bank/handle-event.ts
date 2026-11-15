import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { getActivePoliciesWithRules } from "../repo/policies.js";
import { issueForensicReceipt } from "../forensic/issue.js";
import { applyFieldPolicy } from "./field-policy.js";
import { evaluateBankEvent } from "./evaluate.js";
import { policyContentHash } from "./policy-hash.js";
import { sealGovernedDecision } from "./seal-decision.js";
import {
  findCaseByIdempotency,
  getWorkflowRecordOnly,
  listAuthorityMatrix,
  listBankRoleLadder,
  listFieldPolicies,
  upsertBankCase,
} from "./repo.js";
import type { BankEvent, BankDecisionResponse } from "./types.js";
import type { RuleCombineMode } from "../policy/evaluate-rules.js";
import { isDemoClockActive } from "./demo-clock.js";

function demoClockActive(): boolean {
  return isDemoClockActive();
}

export type HandleBankEventOptions = {
  /** Force evaluate/seal in record-only mode (batch import pilot). */
  forceRecordOnly?: boolean;
};

export async function handleBankEvent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  event: BankEvent,
  options?: HandleBankEventOptions,
): Promise<BankDecisionResponse> {
  const existing = await findCaseByIdempotency(
    client,
    organizationId,
    event.idempotency_key,
  );
  if (existing) {
    return {
      case_id: existing.case_id,
      decision_id: existing.decision_id ?? `dec_idem_${existing.case_id}`,
      receipt_id: existing.receipt_id ?? `rcpt_idem_${existing.case_id}`,
      outcome: (existing.outcome as BankDecisionResponse["outcome"]) ?? "allow",
      mode: existing.mode === "record_only" ? "record_only" : "enforce",
      matched_rules: [],
      event_id: existing.event_id,
      event_hash: null,
      sequence_num: null,
      flags: demoClockActive() ? { demo_clock: true } : undefined,
    };
  }

  const fieldRules = await listFieldPolicies(client, organizationId);
  const fielded = applyFieldPolicy(event.attributes, fieldRules);

  const recordOnly =
    options?.forceRecordOnly === true ||
    (await getWorkflowRecordOnly(
      client,
      organizationId,
      event.workflow_id,
    ));
  const matrix = await listAuthorityMatrix(client, organizationId);
  const ladder = await listBankRoleLadder(client, organizationId);

  // Active policies now return combine + content_hash and fetch rules in one query
  // (avoids N+1 policy_rule round-trips and a second policy SELECT).
  const actives = await getActivePoliciesWithRules(client, organizationId);
  const primary = actives[0];
  let policyCombine: RuleCombineMode =
    primary?.policy.combine === "all_matching" ? "all_matching" : "top_priority";
  let contentHash: string | null = primary?.policy.content_hash ?? null;
  let policyVersion = primary?.policy.version ?? 0;
  let policyId = primary?.policy.policy_id ?? "pol_none";

  if (primary && !contentHash) {
    contentHash = policyContentHash({
      policy_id: primary.policy.policy_id,
      name: primary.policy.name,
      version: primary.policy.version,
      combine: policyCombine,
      rules: primary.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions,
      })),
    });
  }

  // Generic tool name for pack rules; event_type stays on the case for search.
  const toolName =
    typeof event.attributes.tool_name === "string" &&
    event.attributes.tool_name.trim()
      ? String(event.attributes.tool_name).trim()
      : "governed.action";

  const rules =
    primary?.rules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions,
      policy_id: r.policy_id,
      obligations:
        r.conditions &&
        typeof r.conditions === "object" &&
        (r.conditions as { obligations?: unknown }).obligations
          ? (r.conditions as { obligations: unknown }).obligations
          : undefined,
    })) ?? [];

  const evalResult = evaluateBankEvent({
    policy_id: policyId,
    combine: policyCombine,
    rules,
    tool_name: toolName,
    attributes: fielded.for_evaluate,
    matrix_rows: matrix,
    ladder,
    product: event.product,
    record_only: recordOnly,
  });

  const decisionId = `dec_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let receiptId = `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const traceId = event.trace_id ?? `tr_gov_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const matched = evalResult.matched_rules.map((m) => ({
    rule_id: m.rule_id,
    policy_id: m.policy_id,
    decision: m.decision,
  }));

  let eventId: string | null = null;
  let eventHash: string | null = null;
  let sequenceNum: number | null = null;

  // Prefer real APS-1 seal when an org agent signing key exists (D1).
  if ("query" in client) {
    try {
      const sealed = await sealGovernedDecision(client as pg.PoolClient, {
        organization_id: organizationId,
        trace_id: traceId,
        case_id: event.case_id,
        decision_id: decisionId,
        outcome: evalResult.outcome,
        mode: evalResult.mode,
        would_have: evalResult.would_have,
        tool_name: toolName,
        attributes: fielded.stored,
        matched_rules: matched,
        policy_id: policyId,
        policy_version: policyVersion,
        policy_content_hash: contentHash,
        agent_id: event.agent_id,
        idempotency_key: event.idempotency_key,
      });
      if (sealed) {
        eventId = sealed.event_id;
        eventHash = sealed.event_hash;
        sequenceNum = sealed.sequence_num;
      }
    } catch {
      // Fall through to provisional citation
    }
  }

  let provisional = false;
  if (!eventId || !eventHash || sequenceNum == null) {
    provisional = true;
    eventId = `evt_gov_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    eventHash = `sha256:${createHash("sha256")
      .update(
        JSON.stringify({
          case_id: event.case_id,
          decision_id: decisionId,
          outcome: evalResult.outcome,
          attributes: fielded.stored,
        }),
        "utf8",
      )
      .digest("hex")}`;
    sequenceNum = 1;
  }

  if (process.env.AEGIS_RECEIPT_SIGNING_KEY_B64) {
    try {
      const issued = await issueForensicReceipt(client, {
        organization_id: organizationId,
        case_id: event.case_id,
        decision_id: decisionId,
        outcome: evalResult.outcome,
        mode: evalResult.mode,
        would_have: evalResult.would_have,
        policy: {
          policy_id: policyId,
          version: policyVersion,
          content_hash: contentHash,
        },
        matched_rules: matched,
        sealed_events: [
          {
            event_id: eventId,
            event_hash: eventHash,
            sequence_num: sequenceNum,
          },
        ],
        attributes: fielded.stored,
        timeline: [
          {
            at: event.emitted_at,
            type: "decision",
            outcome: evalResult.outcome,
            reason: evalResult.reason,
          },
        ],
        flags: provisional ? { provisional: true } : undefined,
      });
      receiptId = issued.receipt_id;
    } catch {
      // Keep case without sealed receipt if signing/migration unavailable
    }
  }

  const status =
    evalResult.outcome === "hold"
      ? "held"
      : evalResult.outcome === "stop"
        ? "stopped"
        : "approved";

  const insert = await upsertBankCase(client, {
    case_id: event.case_id,
    organization_id: organizationId,
    idempotency_key: event.idempotency_key,
    workflow_id: event.workflow_id ?? null,
    trace_id: traceId,
    event_id: eventId,
    decision_id: decisionId,
    receipt_id: receiptId,
    outcome: evalResult.outcome,
    mode: evalResult.mode,
    status: evalResult.mode === "record_only" ? "approved" : status,
    attributes: fielded.stored,
    matched_rules: evalResult.matched_rules,
    policy_id: policyId,
    policy_version: policyVersion,
    policy_content_hash: contentHash,
  });

  if (insert === "conflict") {
    const again = await findCaseByIdempotency(
      client,
      organizationId,
      event.idempotency_key,
    );
    if (again) {
      return {
        case_id: again.case_id,
        decision_id: again.decision_id ?? decisionId,
        receipt_id: again.receipt_id ?? receiptId,
        outcome: (again.outcome as BankDecisionResponse["outcome"]) ?? "allow",
        mode: again.mode === "record_only" ? "record_only" : "enforce",
        matched_rules: [],
        event_id: again.event_id,
        event_hash: null,
        sequence_num: null,
        flags: {
          ...(demoClockActive() ? { demo_clock: true } : {}),
          ...(provisional ? { provisional: true } : {}),
        },
      };
    }
  }

  return {
    case_id: event.case_id,
    decision_id: decisionId,
    receipt_id: receiptId,
    outcome: evalResult.outcome,
    mode: evalResult.mode,
    would_have: evalResult.would_have,
    matched_rules: matched,
    policy: {
      policy_id: policyId,
      version: policyVersion,
      content_hash: contentHash,
    },
    approval:
      evalResult.outcome === "hold"
        ? {
            required_roles: evalResult.required_roles,
            approval_id: null,
          }
        : null,
    event_id: eventId,
    event_hash: eventHash,
    sequence_num: sequenceNum,
    flags: {
      ...(demoClockActive() ? { demo_clock: true } : {}),
      ...(provisional ? { provisional: true } : {}),
    },
  };
}
