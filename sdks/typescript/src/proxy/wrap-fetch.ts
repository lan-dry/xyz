import { signAndIngest, type IngestResult } from "../ingest.js";
import type { PolicyDecision, SignAndIngestOptions, SignOptions } from "../types.js";
import {
  completeTraceViaApi,
  getApprovalStatusViaApi,
  requestApprovalViaApi,
} from "./approval-client.js";
import { buildPolicyDecisionEvent, buildResultEvent } from "./events.js";
import { ApprovalRequiredError, PolicyDeniedError } from "./errors.js";
import { evaluatePolicyViaApi, type PolicyEvaluateResult } from "./policy-client.js";
import { evaluateToolPolicyLocal } from "./policy.js";

export type WrapFetchContext = {
  organizationId: string;
  agentId: string;
  keyId: string;
  traceId: string;
  toolName: string;
  actorPrincipal?: string;
  /** Merged into the signed policy_decision payload permission (audit / investor narrative). */
  auditPayload?: Record<string, unknown>;
};

export type WrapFetchConfig = {
  context: WrapFetchContext;
  sign: SignOptions;
  ingest: SignAndIngestOptions;
  fetchImpl?: typeof fetch;
  ingestFn?: typeof signAndIngest;
  evaluatePolicyFn?: (
    input: {
      organization_id: string;
      agent_id: string;
      tool_name: string;
    },
  ) => Promise<PolicyEvaluateResult>;
  requestApprovalFn?: typeof requestApprovalViaApi;
  completeTraceFn?: typeof completeTraceViaApi;
  getApprovalStatusFn?: typeof getApprovalStatusViaApi;
};

async function resolveDecision(
  config: WrapFetchConfig,
): Promise<PolicyEvaluateResult> {
  const { context, ingest } = config;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (config.evaluatePolicyFn) {
    return config.evaluatePolicyFn({
      organization_id: context.organizationId,
      agent_id: context.agentId,
      tool_name: context.toolName,
    });
  }

  try {
    return await evaluatePolicyViaApi(
      ingest.apiBaseUrl,
      ingest.ingestApiKey,
      {
        organization_id: context.organizationId,
        agent_id: context.agentId,
        tool_name: context.toolName,
      },
      fetchImpl,
    );
  } catch {
    const local = evaluateToolPolicyLocal(context.toolName);
    return {
      decision: local,
      policy_id: "local-fallback",
      rule_id: null,
      reason: "policy API unavailable; local fallback",
    };
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

  const evaluation = await resolveDecision(config);
  const decision = evaluation.decision as PolicyDecision;

  const decisionEvent = buildPolicyDecisionEvent({
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
    payloadExtras: context.auditPayload,
  });

  const decisionResult = await ingestFn(decisionEvent, sign, ingest);

  if (decision === "deny") {
    throw new PolicyDeniedError(context.toolName);
  }

  if (decision === "allow_with_obligation") {
    const deferred = deferredFromInput(input, init);
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

  return runAllowPath(input, init, config, decisionResult.event_id);
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
