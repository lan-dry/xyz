import { randomUUID } from "node:crypto";
import { enrichProvenancePayload } from "./enrich-payload.js";
import { signAndIngest, type IngestResult } from "./ingest.js";
import { mergeSpanPayload, newSpanId, spanPayload } from "./span.js";
import type { ApsEvent, SignAndIngestOptions, SignOptions } from "./types.js";

export type RecordContext = {
  organizationId: string;
  agentId: string;
  keyId: string;
  traceId: string;
  actorPrincipal: string;
};

export type RecordOptions = {
  sign: SignOptions;
  ingest: SignAndIngestOptions;
  spanId?: string;
  spanLabel?: string;
  enrichPayload?: boolean;
};

function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function applyEnrich(event: ApsEvent, enrich: boolean): ApsEvent {
  if (!enrich) {
    return event;
  }
  return {
    ...event,
    payload: enrichProvenancePayload({
      payload: event.payload,
      toolName: event.tool_name,
      actionKind: event.action_kind,
      policyId: event.policy_id,
    }),
  };
}

async function ingestEvent(
  event: ApsEvent,
  options: RecordOptions,
): Promise<string> {
  const spanId = options.spanId;
  const withSpan: ApsEvent = spanId
    ? {
        ...event,
        span_id: spanId,
        payload: mergeSpanPayload(spanId, options.spanLabel, event.payload),
      }
    : event;
  const result = await signAndIngest(
    applyEnrich(withSpan, options.enrichPayload !== false),
    options.sign,
    options.ingest,
  );
  return result.event_id;
}

/** Opens a trace session (signed). Returns event id. */
export async function recordTraceStart(
  ctx: RecordContext,
  input: {
    triggerSource: string;
    triggerDetail?: string;
    businessContext?: string;
  },
  options: RecordOptions,
): Promise<string> {
  const spanId = options.spanId ?? newSpanId();
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "aegis.trace.start",
    payload: mergeSpanPayload(spanId, options.spanLabel ?? "Session start", {
      trigger_source: input.triggerSource,
      trigger_detail: input.triggerDetail,
      business_context: input.businessContext,
      action: "trace_session_start",
    }),
  };

  return ingestEvent(event, options);
}

/** Closes a trace session (signed). Marks trace completed on ingest. */
export async function recordTraceComplete(
  ctx: RecordContext,
  input: { summary?: string; outcome?: "ok" | "error" },
  options: RecordOptions,
): Promise<string> {
  const spanId = options.spanId ?? newSpanId();
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "aegis.trace.complete",
    payload: mergeSpanPayload(spanId, options.spanLabel ?? "Session complete", {
      action: "trace_session_complete",
      summary: input.summary,
      outcome: input.outcome ?? "ok",
    }),
  };

  return ingestEvent(event, options);
}

/** Records an LLM boundary event (signed + ingested). */
export async function recordLlmInvocation(
  ctx: RecordContext,
  input: {
    toolName: string;
    purpose: string;
    promptPreview: string;
    responsePreview: string;
    dataTouched?: string[];
    parentEventId?: string;
    payload?: Record<string, unknown>;
  },
  options: RecordOptions,
): Promise<string> {
  const spanId = options.spanId;
  const basePayload: Record<string, unknown> = {
    purpose: input.purpose,
    prompt_preview: input.promptPreview,
    response_preview: input.responsePreview,
    data_touched: input.dataTouched ?? [],
    ...input.payload,
  };
  const payload =
    spanId != null
      ? mergeSpanPayload(spanId, options.spanLabel, basePayload)
      : basePayload;

  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "llm_invocation",
    policy_decision: "allow",
    tool_name: input.toolName,
    parent_event_id: input.parentEventId,
    payload,
  };

  return ingestEvent(event, options);
}

/** Signed provenance claim (standalone APS event). */
export async function recordProvenanceClaim(
  ctx: RecordContext,
  input: {
    claim: string;
    authority: string;
    subjectEventId?: string;
    businessContext?: string;
  },
  options: RecordOptions,
): Promise<string> {
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "provenance_claim",
    policy_decision: "allow_retro_audit",
    tool_name: "aegis.provenance.claim",
    payload: {
      claim: input.claim,
      authority: input.authority,
      subject_event_id: input.subjectEventId,
      business_context: input.businessContext,
      action: "provenance_assertion",
    },
  };
  return ingestEvent(event, options);
}

/** Agent decision point (planner / router / branch). */
export async function recordDecision(
  ctx: RecordContext,
  input: {
    decision: string;
    rationale: string;
    alternatives?: string[];
    parentEventId?: string;
  },
  options: RecordOptions,
): Promise<string> {
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "decision",
    policy_decision: "allow",
    tool_name: "aegis.agent.decision",
    parent_event_id: input.parentEventId,
    payload: {
      decision: input.decision,
      rationale: input.rationale,
      alternatives: input.alternatives ?? [],
      action: "agent_decision",
    },
  };
  return ingestEvent(event, options);
}

export type DataAccessSensitivity = "low" | "medium" | "high";
export type DataAccessSource = "tool_result" | "retrieval" | "api" | string;

/** Data read/write boundary for audit (PII, stores, files). */
export async function recordDataAccess(
  ctx: RecordContext,
  input: {
    operation?: "read" | "write";
    resource: string;
    /** Preferred: fields the agent actually saw. */
    fieldsAccessed?: string[];
    /** @deprecated Prefer fieldsAccessed */
    fields?: string[];
    sensitivity?: DataAccessSensitivity;
    /** @deprecated Prefer sensitivity */
    classification?: string;
    volumeBytes?: number;
    source?: DataAccessSource;
    parentEventId?: string;
  },
  options: RecordOptions,
): Promise<string> {
  const operation = input.operation ?? "read";
  const fieldsAccessed = input.fieldsAccessed ?? input.fields ?? [];
  const sensitivity =
    input.sensitivity ??
    (input.classification === "high" ||
    input.classification === "medium" ||
    input.classification === "low"
      ? input.classification
      : undefined);
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "data_access",
    policy_decision: "allow",
    tool_name: `aegis.data.${operation}`,
    parent_event_id: input.parentEventId,
    payload: {
      operation,
      resource: input.resource,
      fields_accessed: fieldsAccessed,
      fields: fieldsAccessed,
      data_touched: fieldsAccessed,
      ...(sensitivity ? { sensitivity, classification: sensitivity } : {}),
      ...(input.volumeBytes != null ? { volume_bytes: input.volumeBytes } : {}),
      ...(input.source ? { source: input.source } : {}),
      action: `${operation}_${input.resource}`,
    },
  };
  return ingestEvent(event, options);
}

export type AnomalySignalType =
  | "prompt_injection_indicator"
  | "unexpected_tool"
  | "sensitive_data_exfiltration"
  | string;

/** Potential prompt injection or unexpected agent behavior. */
export async function recordAnomalySignal(
  ctx: RecordContext,
  input: {
    type: AnomalySignalType;
    reason: string;
    severity: "low" | "medium" | "high";
    linkedEventId?: string;
    parentEventId?: string;
    /** When true, seals as allow_with_obligation (Ask a person). */
    requireApproval?: boolean;
  },
  options: RecordOptions,
): Promise<string> {
  const decision = input.requireApproval ? "allow_with_obligation" : "allow";
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "anomaly_signal",
    policy_decision: decision,
    tool_name: "aegis.anomaly.signal",
    parent_event_id: input.parentEventId ?? input.linkedEventId,
    payload: {
      type: input.type,
      reason: input.reason,
      severity: input.severity,
      ...(input.linkedEventId ? { linked_event_id: input.linkedEventId } : {}),
      action: "anomaly_signal",
    },
  };
  return ingestEvent(event, options);
}

/** Opens a formal span (DB row + signed span.start event). */
export async function startSpan(
  ctx: RecordContext,
  input: { label: string; parentSpanId?: string },
  options: Omit<RecordOptions, "spanId"> & { spanId?: string },
): Promise<string> {
  const spanId = options.spanId ?? newSpanId();
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "aegis.span.start",
    span_id: spanId,
    parent_span_id: input.parentSpanId,
    payload: {
      span_id: spanId,
      span_label: input.label,
      parent_span_id: input.parentSpanId,
      action: "span_start",
    },
  };
  await ingestEvent(event, { ...options, spanId, spanLabel: input.label });
  return spanId;
}

/** Closes a span (signed span.end event). */
export async function endSpan(
  ctx: RecordContext,
  spanId: string,
  options: RecordOptions,
): Promise<string> {
  const event: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "aegis.span.end",
    span_id: spanId,
    payload: { span_id: spanId, action: "span_end" },
  };
  return ingestEvent(event, { ...options, spanId });
}

export function newTraceId(): string {
  return `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export { newSpanId, spanPayload, type IngestResult };
