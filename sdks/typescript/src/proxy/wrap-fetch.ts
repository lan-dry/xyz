import { signAndIngest, type IngestResult } from "../ingest.js";
import type { PolicyDecision, SignAndIngestOptions, SignOptions } from "../types.js";
import {
  checkApprovalBindViaApi,
  completeTraceViaApi,
  getApprovalStatusViaApi,
  requestApprovalViaApi,
} from "./approval-client.js";
import { buildPolicyDecisionEvent, buildResultEvent } from "./events.js";
import {
  ApprovalRequiredError,
  PolicyDeniedError,
  PolicyEvaluationUnavailableError,
} from "./errors.js";
import { evaluatePolicyViaApi, type PolicyEvaluateResult } from "./policy-client.js";
import {
  drainSignedEventBuffer,
  enqueueSignedEvent,
  type FailMode,
} from "./signed-buffer.js";

export type WrapFetchContext = {
  organizationId: string;
  agentId: string;
  keyId: string;
  traceId: string;
  toolName: string;
  actorPrincipal?: string;
  spanId?: string;
  spanLabel?: string;
  /** Business context used by policy evaluation, such as amount, segment, account type, or beneficiary. */
  policyPayload?: Record<string, unknown>;
  /** Merged into the signed policy_decision payload permission (audit / investor narrative). */
  auditPayload?: Record<string, unknown>;
};

export type WrapFetchConfig = {
  context: WrapFetchContext;
  sign: SignOptions;
  ingest: SignAndIngestOptions;
  /**
   * When Aegis policy evaluate is unreachable:
   * - fail_closed (default): block the tool
   * - fail_open_buffer: allow the outbound call and queue a local signed decision for later drain
   */
  failMode?: FailMode;
  fetchImpl?: typeof fetch;
  ingestFn?: typeof signAndIngest;
  evaluatePolicyFn?: (
    input: {
      organization_id: string;
      agent_id: string;
      tool_name: string;
      payload?: Record<string, unknown>;
    },
  ) => Promise<PolicyEvaluateResult>;
  requestApprovalFn?: typeof requestApprovalViaApi;
  completeTraceFn?: typeof completeTraceViaApi;
  getApprovalStatusFn?: typeof getApprovalStatusViaApi;
};

async function resolveDecision(
  config: WrapFetchConfig,
): Promise<PolicyEvaluateResult & { buffered?: boolean }> {
  const { context, ingest } = config;
  const fetchImpl = config.fetchImpl ?? fetch;
  const payload = context.policyPayload ?? context.auditPayload;
  const failMode: FailMode = config.failMode ?? "fail_closed";

  try {
    if (config.evaluatePolicyFn) {
      return await config.evaluatePolicyFn({
        organization_id: context.organizationId,
        agent_id: context.agentId,
        tool_name: context.toolName,
        payload,
      });
    }

    return await evaluatePolicyViaApi(
      ingest.apiBaseUrl,
      ingest.ingestApiKey,
      {
        organization_id: context.organizationId,
        agent_id: context.agentId,
        tool_name: context.toolName,
        payload,
      },
      fetchImpl,
    );
  } catch (error) {
    if (failMode === "fail_open_buffer") {
      // Allow path continues; caller records a buffered allow decision.
      return {
        decision: "allow",
        policy_id: "fail_open_buffer",
        rule_id: null,
        reason: "aegis_unreachable_fail_open_buffer",
        engine: "local_buffer",
        buffered: true,
      };
    }
    // Fail closed. The outbound request must never run without a policy decision.
    throw new PolicyEvaluationUnavailableError(context.toolName, error);
  }
}

function deferredFromInput(
  input: string | URL,
  init: RequestInit | undefined,
): { url: string; method: string } {
  const url = typeof input === "string" ? input : input.toString();
  return { url, method: init?.method ?? "GET" };
}

async function runAllowPath(
  input: string | URL,
  init: RequestInit | undefined,
  config: WrapFetchConfig,
  parentEventId: string,
): Promise<Response> {
  const { context, sign, ingest } = config;
  const ingestFn = config.ingestFn ?? signAndIngest;
  const fetchImpl = config.fetchImpl ?? fetch;
  const actorPrincipal = context.actorPrincipal ?? context.agentId;

  const response = await fetchImpl(input, init);

  const resultEvent = buildResultEvent({
    organizationId: context.organizationId,
    traceId: context.traceId,
    agentId: context.agentId,
    keyId: context.keyId,
    toolName: context.toolName,
    actorPrincipal,
    parentEventId,
    httpStatus: response.status,
  });

  await ingestFn(resultEvent, sign, ingest);
  return response;
}

export async function wrapFetch(
  input: string | URL,
  init: RequestInit | undefined,
  config: WrapFetchConfig,
): Promise<Response> {
  const { context, sign, ingest } = config;
  const ingestFn = config.ingestFn ?? signAndIngest;
  const fetchImpl = config.fetchImpl ?? fetch;
  const requestApproval = config.requestApprovalFn ?? requestApprovalViaApi;
  const actorPrincipal = context.actorPrincipal ?? context.agentId;
  const spanPayload = {
    ...(context.spanId ? { span_id: context.spanId } : {}),
    ...(context.spanLabel ? { span_label: context.spanLabel } : {}),
  };

  const evaluation = await resolveDecision(config);
  const decision = evaluation.decision as PolicyDecision;
  const layerPayload = {
    ...(evaluation.decision_layer
      ? { decision_layer: evaluation.decision_layer }
      : {}),
    ...(evaluation.signals && Object.keys(evaluation.signals).length > 0
      ? { signals: evaluation.signals }
      : {}),
  };

  if (decision === "allow_with_obligation") {
    const deferred = deferredFromInput(input, init);
    const decisionEvent = {
      ...buildPolicyDecisionEvent({
        organizationId: context.organizationId,
        traceId: context.traceId,
        agentId: context.agentId,
        keyId: context.keyId,
        toolName: context.toolName,
        decision,
        actorPrincipal,
        policyId: evaluation.policy_id,
        ruleId: evaluation.rule_id,
        reason: evaluation.reason,
        payloadExtras: {
          ...spanPayload,
          ...context.auditPayload,
          ...layerPayload,
          deferred_request: deferred,
          obligation_tool: context.toolName,
        },
      }),
      // Seal top-level span_id when present so Verify reconstruction matches ingest.
      ...(context.spanId ? { span_id: context.spanId } : {}),
    };

    const decisionResult = await ingestFn(decisionEvent, sign, ingest);

    const { approval_id } = await requestApproval(
      ingest.apiBaseUrl,
      ingest.ingestApiKey,
      {
        organization_id: context.organizationId,
        event_id: decisionResult.event_id,
        trace_id: context.traceId,
        tool_name: context.toolName,
        deferred,
      },
      fetchImpl,
    );
    throw new ApprovalRequiredError(
      context.toolName,
      approval_id,
      decisionResult.event_id,
    );
  }

  const decisionEvent = {
    ...buildPolicyDecisionEvent({
      organizationId: context.organizationId,
      traceId: context.traceId,
      agentId: context.agentId,
      keyId: context.keyId,
      toolName: context.toolName,
      decision,
      actorPrincipal,
      policyId: evaluation.policy_id,
      ruleId: evaluation.rule_id,
      reason: evaluation.reason,
      payloadExtras: {
        ...spanPayload,
        ...context.auditPayload,
        ...layerPayload,
        ...(evaluation.buffered ? { buffered_offline: true } : {}),
      },
    }),
    ...(context.spanId ? { span_id: context.spanId } : {}),
  };

  let parentEventId: string;
  try {
    const decisionResult = await ingestFn(decisionEvent, sign, ingest);
    parentEventId = decisionResult.event_id;
  } catch (ingestError) {
    if (evaluation.buffered || config.failMode === "fail_open_buffer") {
      await enqueueSignedEvent(decisionEvent, "pending_local_sign");
      parentEventId = decisionEvent.event_id;
    } else {
      throw ingestError;
    }
  }

  if (decision === "deny") {
    throw new PolicyDeniedError(context.toolName);
  }

  // Best-effort drain of any previously buffered events once Aegis is reachable.
  if (!evaluation.buffered) {
    void drainSignedEventBuffer({ sign, ingest, ingestFn });
  }

  return runAllowPath(input, init, config, parentEventId);
}

/**
 * Resume after human approval — runs deferred fetch and completes the trace.
 */
export async function wrapFetchResume(
  approvalId: string,
  input: string | URL,
  init: RequestInit | undefined,
  config: WrapFetchConfig,
): Promise<Response> {
  const { context, ingest } = config;
  const fetchImpl = config.fetchImpl ?? fetch;

  const getStatus = config.getApprovalStatusFn ?? getApprovalStatusViaApi;
  const status = await getStatus(
    ingest.apiBaseUrl,
    ingest.ingestApiKey,
    approvalId,
    fetchImpl,
  );
  if (status.status !== "approved") {
    throw new Error(`Approval ${approvalId} is not approved (status=${status.status})`);
  }

  // Claude §13.2 — reject resume if agent mutated the approved parameters.
  const bindPayload = context.policyPayload ?? context.auditPayload;
  const bind = await checkApprovalBindViaApi(
    ingest.apiBaseUrl,
    ingest.ingestApiKey,
    approvalId,
    bindPayload,
    fetchImpl,
  );
  if (!bind.match) {
    throw new PolicyDeniedError(
      context.toolName,
      bind.detail ??
        "Approved action does not match intended execution. Approval is invalid.",
    );
  }

  const response = await runAllowPath(input, init, config, status.event_id);

  const completeTrace =
    config.completeTraceFn ?? completeTraceViaApi;
  await completeTrace(
    ingest.apiBaseUrl,
    ingest.ingestApiKey,
    approvalId,
    context.traceId,
    context.organizationId,
    fetchImpl,
  );

  return response;
}

export type { IngestResult };
