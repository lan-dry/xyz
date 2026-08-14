import type { GovernanceBridge } from "../bridge.js";
import { getActiveGovernanceSession } from "../bridge.js";
import { signAndIngest } from "../ingest.js";
import { evaluatePolicyViaApi } from "../proxy/policy-client.js";
import { ApprovalRequiredError, PolicyDeniedError } from "../proxy/errors.js";
import type { ApsEvent, PolicyDecision } from "../types.js";
import { randomUUID } from "node:crypto";

export type LangGraphToolConfig<TInput extends Record<string, unknown>, TResult> = {
  toolName: string;
  description?: string;
  /** Merged into policy evaluate + signed tool_call payload. */
  mapPayload?: (input: TInput) => Record<string, unknown>;
  handler: (input: TInput) => Promise<TResult> | TResult;
};

function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

async function recordToolCall(
  bridge: GovernanceBridge,
  input: {
    toolName: string;
    decision: PolicyDecision;
    policyId?: string;
    payload: Record<string, unknown>;
    resultPreview?: string;
  },
): Promise<string> {
  const session = getActiveGovernanceSession();
  if (!session) {
    throw new Error(
      "wrapLangGraphTool requires an active trace. Call bridge.withTrace() before invoking the tool.",
    );
  }

  const cfg = bridge.getConfig();
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: cfg.organizationId,
    trace_id: session.traceId,
    agent_id: cfg.agentId,
    key_id: cfg.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: cfg.actorPrincipal,
    action_kind: "tool_call",
    policy_decision: input.decision,
    policy_id: input.policyId,
    tool_name: input.toolName,
    span_id: session.spanId,
    payload: {
      ...input.payload,
      result_preview: input.resultPreview,
      action: "tool_call",
    },
  };

  const result = await signAndIngest(event, { privateKeyB64: cfg.privateKeyB64, keyId: cfg.keyId }, {
    apiBaseUrl: cfg.apiBaseUrl,
    ingestApiKey: cfg.ingestApiKey,
  });
  return result.event_id;
}

/**
 * Wraps a LangGraph-compatible async tool with Aegis policy evaluation and signed APS-1 events.
 * Must run inside `bridge.withTrace(...)`.
 */
export function wrapLangGraphTool<TInput extends Record<string, unknown>, TResult>(
  bridge: GovernanceBridge,
  config: LangGraphToolConfig<TInput, TResult>,
): (input: TInput) => Promise<TResult> {
  return async (input: TInput) => {
    const cfg = bridge.getConfig();
    const payload = config.mapPayload?.(input) ?? (input as Record<string, unknown>);

    const decision = await evaluatePolicyViaApi(cfg.apiBaseUrl, cfg.ingestApiKey, {
      organization_id: cfg.organizationId,
      agent_id: cfg.agentId,
      tool_name: config.toolName,
      payload,
    });

    if (decision.decision === "deny") {
      await recordToolCall(bridge, {
        toolName: config.toolName,
        decision: "deny",
        policyId: decision.policy_id,
        payload,
      });
      throw new PolicyDeniedError(config.toolName);
    }

    if (decision.decision === "allow_with_obligation") {
      throw new ApprovalRequiredError(config.toolName, "pending", "pending");
    }

    await recordToolCall(bridge, {
      toolName: config.toolName,
      decision: "allow",
      policyId: decision.policy_id,
      payload,
    });

    return await config.handler(input);
  };
}
