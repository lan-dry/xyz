import { randomUUID } from "node:crypto";
import type { ApsEvent, PolicyDecision } from "../types.js";

export function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function buildPolicyDecisionEvent(params: {
  organizationId: string;
  traceId: string;
  agentId: string;
  keyId: string;
  toolName: string;
  decision: PolicyDecision;
  actorPrincipal: string;
  policyId?: string | null;
  ruleId?: string | null;
  reason?: string;
  payloadExtras?: Record<string, unknown>;
}): ApsEvent {
  const denied = params.decision === "deny";
  return {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: params.organizationId,
    trace_id: params.traceId,
    agent_id: params.agentId,
    key_id: params.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: params.actorPrincipal,
    action_kind: "policy_decision",
    policy_decision: params.decision,
    tool_name: params.toolName,
    policy_id:
      params.policyId && params.policyId !== "none" ? params.policyId : undefined,
    payload: {
      policy_id: params.policyId ?? null,
      rule_id:
        params.ruleId ??
        (denied ? "deny:unattributed" : "allow:default"),
      reason:
        params.reason ??
        (denied ? "policy denied" : "policy allowed"),
      ...params.payloadExtras,
    },
  };
}

export function httpResultStatus(httpStatus: number): "ok" | "error" | "timeout" | "blocked" {
  if (httpStatus >= 200 && httpStatus < 400) {
    return "ok";
  }
  if (httpStatus === 408 || httpStatus === 504) {
    return "timeout";
  }
  return "error";
}

export function buildResultEvent(params: {
  organizationId: string;
  traceId: string;
  agentId: string;
  keyId: string;
  toolName: string;
  actorPrincipal: string;
  parentEventId: string;
  httpStatus: number;
}): ApsEvent {
  const resultStatus = httpResultStatus(params.httpStatus);
  return {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: params.organizationId,
    trace_id: params.traceId,
    agent_id: params.agentId,
    key_id: params.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: params.actorPrincipal,
    action_kind: "result",
    policy_decision: "allow",
    tool_name: params.toolName,
    parent_event_id: params.parentEventId,
    result_status: resultStatus,
    payload: { http_status: params.httpStatus, result_status: resultStatus },
  };
}
