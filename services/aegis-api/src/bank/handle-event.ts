import { randomUUID } from "node:crypto";
import type pg from "pg";
import { getActivePoliciesWithRules } from "../repo/policies.js";
import { applyFieldPolicy } from "./field-policy.js";
import { evaluateBankEvent } from "./evaluate.js";
import { policyContentHash } from "./policy-hash.js";
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

function demoClockActive(): boolean {
  return process.env.AEGIS_DEMO_CLOCK === "true";
}

export async function handleBankEvent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  event: BankEvent,
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

  const recordOnly = await getWorkflowRecordOnly(
    client,
    organizationId,
    event.workflow_id,
  );
  const matrix = await listAuthorityMatrix(client, organizationId);
  const ladder = await listBankRoleLadder(client, organizationId);

  const actives = await getActivePoliciesWithRules(client, organizationId);
  const primary = actives[0];
  const combine: RuleCombineMode =
    ((primary?.policy as { combine?: string } | undefined)?.combine as
      | RuleCombineMode
      | undefined) ?? "top_priority";

  // Prefer policy.combine from DB when column exists
  let policyCombine = combine;
  let contentHash: string | null = null;
  let policyVersion = primary?.policy.version ?? 0;
  let policyId = primary?.policy.policy_id ?? "pol_none";

  if (primary) {
    const combineRow = await client.query<{
      combine: string;
      content_hash: string | null;
      version: number;
    }>(
      `SELECT COALESCE(combine, 'top_priority') AS combine, content_hash, version
       FROM policy WHERE policy_id = $1`,
      [primary.policy.policy_id],
    );
    const row = combineRow.rows[0];
    if (row) {
      policyCombine =
        row.combine === "all_matching" ? "all_matching" : "top_priority";
      contentHash = row.content_hash;
      policyVersion = row.version;
    }
    policyId = primary.policy.policy_id;

    if (!contentHash) {
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
  }

  const toolName =
    event.event_type === "loan_decision"
      ? "bank.loan.decide"
      : event.event_type === "payment_transfer"
        ? "bank.payment.transfer"
        : event.event_type === "data_access"
          ? "bank.data.access"
          : `bank.${event.event_type}`;

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
  const receiptId = `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const traceId = event.trace_id ?? `tr_bank_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

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
    event_id: null,
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
        flags: demoClockActive() ? { demo_clock: true } : undefined,
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
    matched_rules: evalResult.matched_rules.map((m) => ({
      rule_id: m.rule_id,
      policy_id: m.policy_id,
      decision: m.decision,
    })),
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
    event_id: null,
    event_hash: null,
    sequence_num: null,
    flags: demoClockActive() ? { demo_clock: true } : undefined,
  };
}
