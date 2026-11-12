import { randomUUID } from "node:crypto";
import type { ApsEvent, PolicyDecision } from "@salanor/aegis";

import {
  outcomeToPolicyDecision,
  type SensitiveAction,
} from "./types.js";

export type ApsCredentials = {
  organizationId: string;
  agentId: string;
  keyId: string;
  actorPrincipal?: string;
};

export type BuiltCase = {
  traceId: string;
  events: ApsEvent[];
};

function newId(prefix: "evt" | "trc"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Turn one SensitiveAction into the APS-1 events Aegis seals:
 * data seen → policy decision → optional human approval → case complete.
 */
export function sensitiveActionToAps(
  action: SensitiveAction,
  creds: ApsCredentials,
  options?: { traceId?: string },
): BuiltCase {
  const traceId = options?.traceId ?? newId("trc");
  const actor = creds.actorPrincipal ?? `agent:${creds.agentId}`;
  const policyDecision = outcomeToPolicyDecision(action.outcome);
  const fields = [...new Set(action.fields_accessed.map((f) => f.trim()).filter(Boolean))];
  const sensitivity = action.sensitivity ?? "medium";
  const now = () => new Date().toISOString();

  function base(
    eventId: string,
    parent: string | undefined,
    decision: PolicyDecision,
  ): Pick<
    ApsEvent,
    | "schema_version"
    | "event_id"
    | "organization_id"
    | "trace_id"
    | "agent_id"
    | "key_id"
    | "emitted_at"
    | "actor_type"
    | "actor_principal"
    | "parent_event_id"
    | "policy_decision"
  > {
    return {
      schema_version: 1,
      event_id: eventId,
      organization_id: creds.organizationId,
      trace_id: traceId,
      agent_id: creds.agentId,
      key_id: creds.keyId,
      emitted_at: now(),
      actor_type: "agent",
      actor_principal: actor,
      parent_event_id: parent,
      policy_decision: decision,
    };
  }

  const events: ApsEvent[] = [];

  const accessId = newId("evt");
  events.push({
    ...base(accessId, undefined, "allow"),
    action_kind: "data_access",
    tool_name: "aegis.data.read",
    payload: {
      operation: "read",
      resource: action.resource,
      fields_accessed: fields,
      fields,
      data_touched: fields,
      sensitivity,
      classification: sensitivity,
      ...(action.source ? { source: action.source } : {}),
      task: action.action,
      summary: action.summary,
      action: `read_${action.resource}`,
      ...(action.context ? { context: action.context } : {}),
    },
  });

  const decisionId = newId("evt");
  // Keep policy.id in the payload only. The event.policy_id column is an FK to
  // policy(policy_id); example ids like pol-loan-decision-v1 are not real rows.
  events.push({
    ...base(decisionId, accessId, policyDecision),
    action_kind: "policy_decision",
    tool_name: "aegis.data.read",
    payload: {
      policy_id: action.policy.id,
      reason: action.policy.reason,
      decision_layer: "contextual",
      evaluation_context: {
        sensitivity,
        resource: action.resource,
        fields_accessed: fields,
        outcome: action.outcome,
        ...(action.context ?? {}),
      },
    },
  });

  let parent = decisionId;
  const approval = action.approval;
  const decided =
    approval?.decision === "approved" || approval?.decision === "rejected";

  if (approval?.required) {
    const approvalId = newId("evt");
    events.push({
      ...base(
        approvalId,
        decisionId,
        decided
          ? approval.decision === "approved"
            ? "allow"
            : "deny"
          : "allow_with_obligation",
      ),
      action_kind: "human_approval",
      tool_name: "aegis.approval.record",
      actor_type: decided ? "human" : "system",
      actor_principal: approval.approver ?? actor,
      payload: {
        decision: approval.decision ?? "pending",
        ...(approval.approver
          ? { approver: approval.approver, approver_email: approval.approver }
          : {}),
        ...(approval.decided_at ? { decided_at: approval.decided_at } : {}),
        reason: action.policy.reason,
        action: "human_approval",
      },
    });
    parent = approvalId;
  }

  const stillWaiting =
    action.outcome === "paused" && (!approval?.required || !decided);

  if (!stillWaiting) {
    const completeId = newId("evt");
    events.push({
      ...base(
        completeId,
        parent,
        policyDecision === "deny" ? "deny" : "allow",
      ),
      action_kind: "tool_call",
      tool_name: "aegis.trace.complete",
      payload: {
        action: "trace_session_complete",
        summary: action.summary,
        outcome: action.outcome === "blocked" ? "error" : "ok",
        task: action.action,
      },
    });
  }

  return { traceId, events };
}
