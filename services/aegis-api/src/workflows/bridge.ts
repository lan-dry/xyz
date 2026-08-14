import { randomUUID } from "node:crypto";
import { signEvent, type ApsEvent, type ActionKind, type PolicyDecision } from "@salanor/aegis";
import type pg from "pg";

import {
  decryptBridgePrivateKey,
  encryptBridgePrivateKey,
  isBridgeMasterKeyConfigured,
} from "../crypto/bridge-key-vault.js";
import { persistSignedEvent } from "../ingest/persist.js";
import { createApprovalRequest, voidPendingApprovalsForTerminalTrace } from "../repo/approvals.js";
import { completeTrace } from "../repo/trace-status.js";
import { generateEd25519KeyPair } from "@salanor/platform-auth";

function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function newTraceId(): string {
  return `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function preview(text: string, max = 200): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type BridgeKeyMaterial = {
  agentId: string;
  keyId: string;
  privateKeyB64: string;
};

export type WorkflowStepInput = {
  action_kind?: ActionKind;
  tool_name?: string;
  purpose?: string;
  prompt?: string;
  response?: string;
  decision?: string;
  rationale?: string;
  resource?: string;
  fields?: string[];
  operation?: "read" | "write";
  span_label?: string;
  parent_event_id?: string;
  policy_decision?: PolicyDecision;
  payload?: Record<string, unknown>;
  /** High-level node capture from n8n Complete body */
  kind?: "llm" | "tool" | "decision" | "data" | "result";
  name?: string;
  status?: string;
  input_preview?: string;
  output_preview?: string;
};

export type PolicyGateCapture = {
  tool_name: string;
  decision: PolicyDecision;
  policy_id: string;
  rule_id: string | null;
  reason: string;
  engine?: string;
};

function policyGateStep(
  gate: PolicyGateCapture,
  requestPayload?: Record<string, unknown>,
): WorkflowStepInput {
  const denied = gate.decision === "deny";
  return {
    action_kind: "policy_decision",
    tool_name: gate.tool_name,
    policy_decision: gate.decision,
    purpose: `Policy ${gate.decision}`,
    decision: gate.decision,
    rationale: gate.reason,
    payload: {
      policy_id: gate.policy_id,
      rule_id: gate.rule_id,
      engine: gate.engine ?? "rules",
      blocked: denied,
      investor_summary: denied
        ? `Denied ${gate.tool_name}: ${gate.reason}`
        : gate.decision === "allow_with_obligation"
          ? `Approval required: ${gate.tool_name}: ${gate.reason}`
          : `Allowed ${gate.tool_name}`,
      ...(requestPayload && Object.keys(requestPayload).length > 0
        ? { request_payload: requestPayload }
        : {}),
    },
  };
}

export type ExecutionNodeCapture = {
  name: string;
  kind: "llm" | "tool" | "decision" | "data" | "result";
  tool_name?: string;
  status?: string;
  input_preview?: string;
  output_preview?: string;
  purpose?: string;
  payload?: Record<string, unknown>;
};

export async function resolveBridgeKey(
  client: pg.PoolClient,
  organizationId: string,
  agentId?: string,
  keyId?: string,
): Promise<BridgeKeyMaterial | null> {
  const result = await client.query<{
    agent_id: string;
    key_id: string;
    private_key_ciphertext: string | null;
  }>(
    `SELECT sk.agent_id, sk.key_id, sk.private_key_ciphertext
     FROM signing_key sk
     JOIN agent a ON a.agent_id = sk.agent_id
     WHERE sk.organization_id = $1
       AND sk.bridge_enabled = true
       AND sk.revoked = false
       AND a.active = true
       AND sk.private_key_ciphertext IS NOT NULL
       AND ($2::text IS NULL OR sk.agent_id = $2)
       AND ($3::text IS NULL OR sk.key_id = $3)
     ORDER BY sk.created_at DESC
     LIMIT 1`,
    [organizationId, agentId ?? null, keyId ?? null],
  );

  const row = result.rows[0];
  if (!row?.private_key_ciphertext) {
    return null;
  }

  return {
    agentId: row.agent_id,
    keyId: row.key_id,
    privateKeyB64: decryptBridgePrivateKey(row.private_key_ciphertext),
  };
}

/**
 * Enable Workflow Bridge on an existing agent by generating a new server-held key.
 * Private key is encrypted at rest; never returned to the client.
 * Idempotent: if already enabled, returns the existing bridge key (unless forceRotate).
 */
export async function enableWorkflowBridgeForAgent(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    organizationSlug: string;
    agentId: string;
    forceRotate?: boolean;
  },
): Promise<{
  agent_id: string;
  key_id: string;
  public_key_b64: string;
  already_enabled: boolean;
}> {
  if (!isBridgeMasterKeyConfigured()) {
    throw new Error("AEGIS_BRIDGE_MASTER_KEY is not configured on aegis-api");
  }

  const agent = await client.query<{ agent_id: string }>(
    `SELECT agent_id FROM agent
     WHERE agent_id = $1 AND organization_id = $2 AND active = true`,
    [input.agentId, input.organizationId],
  );
  if (!agent.rows[0]) {
    throw new Error("Agent not found");
  }

  if (!input.forceRotate) {
    const existing = await client.query<{
      key_id: string;
      public_key_b64: string;
    }>(
      `SELECT key_id, public_key_b64 FROM signing_key
       WHERE agent_id = $1 AND organization_id = $2
         AND bridge_enabled = true AND revoked = false
         AND private_key_ciphertext IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.agentId, input.organizationId],
    );
    if (existing.rows[0]) {
      return {
        agent_id: input.agentId,
        key_id: existing.rows[0].key_id,
        public_key_b64: existing.rows[0].public_key_b64,
        already_enabled: true,
      };
    }
  }

  const keyId = `key_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { publicKeyB64, privateKeyB64 } = await generateEd25519KeyPair();
  const ciphertext = encryptBridgePrivateKey(privateKeyB64);

  await client.query(
    `UPDATE signing_key SET bridge_enabled = false
     WHERE agent_id = $1 AND bridge_enabled = true`,
    [input.agentId],
  );

  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, public_key_b64,
       valid_from, private_key_ciphertext, bridge_enabled
     )
     VALUES ($1, $2, $3, 'vault', $4, now(), $5, true)`,
    [keyId, input.agentId, input.organizationId, publicKeyB64, ciphertext],
  );

  return {
    agent_id: input.agentId,
    key_id: keyId,
    public_key_b64: publicKeyB64,
    already_enabled: false,
  };
}

async function signAndPersist(
  client: pg.PoolClient,
  event: ApsEvent,
  privateKeyB64: string,
  keyId: string,
): Promise<{ eventId: string; sequenceNum: number; eventHash: string }> {
  const signed = await signEvent(event, { privateKeyB64, keyId });
  const result = await persistSignedEvent(client, signed, undefined);
  return {
    eventId: result.eventId,
    sequenceNum: result.sequenceNum,
    eventHash: result.eventHash,
  };
}

function mapNodeToStep(node: ExecutionNodeCapture): WorkflowStepInput {
  return {
    kind: node.kind,
    name: node.name,
    tool_name: node.tool_name,
    status: node.status,
    input_preview: node.input_preview,
    output_preview: node.output_preview,
    purpose: node.purpose ?? node.name,
    payload: node.payload,
  };
}

function stepToEvent(
  step: WorkflowStepInput,
  ctx: {
    organizationId: string;
    agentId: string;
    keyId: string;
    traceId: string;
    actorPrincipal: string;
    parentEventId?: string;
  },
): ApsEvent {
  const kind =
    step.action_kind ??
    (step.kind === "llm"
      ? "llm_invocation"
      : step.kind === "decision"
        ? "decision"
        : step.kind === "data"
          ? "data_access"
          : step.kind === "result"
            ? "result"
            : "tool_call");

  const toolName =
    step.tool_name ??
    (kind === "llm_invocation"
      ? "orchestrator.llm"
      : kind === "decision"
        ? "orchestrator.decision"
        : kind === "data_access"
          ? "orchestrator.data"
          : step.name
            ? `n8n.node.${step.name.replace(/\s+/g, "_").toLowerCase()}`
            : "orchestrator.step");

  const payload: Record<string, unknown> = {
    ...(step.payload ?? {}),
    trigger_source: "workflow_bridge",
    span_label: step.span_label ?? step.name ?? step.purpose,
  };

  if (kind === "llm_invocation") {
    payload.purpose = step.purpose ?? step.name ?? "llm";
    payload.prompt_preview = preview(step.prompt ?? step.input_preview ?? "");
    payload.response_preview = preview(step.response ?? step.output_preview ?? "");
  } else if (kind === "policy_decision") {
    payload.decision = step.policy_decision ?? step.decision ?? "allow";
    payload.rationale = step.rationale ?? step.purpose ?? "";
    payload.tool_under_review = toolName;
  } else if (kind === "decision") {
    payload.decision = step.decision ?? step.status ?? "recorded";
    payload.rationale = step.rationale ?? step.output_preview ?? step.purpose ?? "";
  } else if (kind === "data_access") {
    payload.operation = step.operation ?? "read";
    payload.resource = step.resource ?? step.name ?? "data";
    payload.fields = step.fields ?? [];
  } else {
    payload.node_name = step.name;
    payload.status = step.status;
    if (step.input_preview) payload.input_preview = preview(step.input_preview);
    if (step.output_preview) payload.output_preview = preview(step.output_preview);
  }

  return {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: ctx.organizationId,
    trace_id: ctx.traceId,
    agent_id: ctx.agentId,
    key_id: ctx.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: ctx.actorPrincipal,
    action_kind: kind,
    policy_decision: step.policy_decision ?? "allow",
    tool_name: toolName,
    parent_event_id: step.parent_event_id ?? ctx.parentEventId,
    payload,
  };
}

export async function startWorkflowRun(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    agentId?: string;
    keyId?: string;
    actorPrincipal?: string;
    businessContext?: string;
    externalSystem?: string;
    externalWorkflowId?: string;
    externalExecutionId?: string;
    triggerDetail?: string;
  },
): Promise<{
  trace_id: string;
  root_event_id: string;
  agent_id: string;
  key_id: string;
  status: "running";
}> {
  const bridge = await resolveBridgeKey(
    client,
    input.organizationId,
    input.agentId,
    input.keyId,
  );
  if (!bridge) {
    throw new Error(
      "No Workflow Bridge signing key. Enable bridge on an agent in Console (Agents → Enable Workflow Bridge).",
    );
  }

  const traceId = newTraceId();
  const actor = input.actorPrincipal ?? `workflow:${input.externalSystem ?? "n8n"}`;

  const startEvent: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: input.organizationId,
    trace_id: traceId,
    agent_id: bridge.agentId,
    key_id: bridge.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: actor,
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "aegis.trace.start",
    payload: {
      action: "trace_session_start",
      trigger_source: input.externalSystem ?? "n8n",
      trigger_detail: input.triggerDetail ?? input.externalExecutionId,
      business_context: input.businessContext,
      external_workflow_id: input.externalWorkflowId,
      external_execution_id: input.externalExecutionId,
      investor_summary:
        input.businessContext ??
        `Workflow run started via ${input.externalSystem ?? "n8n"}`,
    },
  };

  const persisted = await signAndPersist(
    client,
    startEvent,
    bridge.privateKeyB64,
    bridge.keyId,
  );

  await client.query(
    `INSERT INTO workflow_run (
       trace_id, organization_id, agent_id, key_id, external_system,
       external_workflow_id, external_execution_id, status, root_event_id, business_context
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9)`,
    [
      traceId,
      input.organizationId,
      bridge.agentId,
      bridge.keyId,
      input.externalSystem ?? "n8n",
      input.externalWorkflowId ?? null,
      input.externalExecutionId ?? null,
      persisted.eventId,
      input.businessContext ?? null,
    ],
  );

  return {
    trace_id: traceId,
    root_event_id: persisted.eventId,
    agent_id: bridge.agentId,
    key_id: bridge.keyId,
    status: "running",
  };
}

export async function appendWorkflowSteps(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    traceId: string;
    steps: WorkflowStepInput[];
    actorPrincipal?: string;
  },
): Promise<{ events: Array<{ event_id: string; action_kind: string; tool_name?: string }> }> {
  if (input.steps.length === 0) {
    return { events: [] };
  }
  if (input.steps.length > 50) {
    throw new Error("Maximum 50 steps per request");
  }

  const run = await client.query<{
    agent_id: string;
    key_id: string;
    status: string;
    root_event_id: string | null;
  }>(
    `SELECT agent_id, key_id, status, root_event_id FROM workflow_run
     WHERE trace_id = $1 AND organization_id = $2`,
    [input.traceId, input.organizationId],
  );
  const row = run.rows[0];
  if (!row) {
    throw new Error("Workflow run not found");
  }
  if (row.status !== "running") {
    throw new Error(`Workflow run is ${row.status}`);
  }

  const bridge = await resolveBridgeKey(
    client,
    input.organizationId,
    row.agent_id,
    row.key_id,
  );
  if (!bridge) {
    throw new Error("Bridge signing key unavailable");
  }

  const actor = input.actorPrincipal ?? "workflow:n8n";
  const events: Array<{ event_id: string; action_kind: string; tool_name?: string }> = [];
  let parent = row.root_event_id ?? undefined;

  for (const step of input.steps) {
    const event = stepToEvent(step, {
      organizationId: input.organizationId,
      agentId: bridge.agentId,
      keyId: bridge.keyId,
      traceId: input.traceId,
      actorPrincipal: actor,
      parentEventId: parent,
    });
    const persisted = await signAndPersist(
      client,
      event,
      bridge.privateKeyB64,
      bridge.keyId,
    );
    events.push({
      event_id: persisted.eventId,
      action_kind: event.action_kind,
      tool_name: event.tool_name,
    });
    parent = persisted.eventId;
  }

  return { events };
}

export async function completeWorkflowRun(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    traceId: string;
    status?: "completed" | "failed";
    summary?: string;
    steps?: WorkflowStepInput[];
    execution?: {
      workflow_name?: string;
      execution_id?: string;
      nodes?: ExecutionNodeCapture[];
    };
    /** Policy check from n8n Check Policy — folded into this trace (one trace per run). */
    policy_gate?: PolicyGateCapture;
    actorPrincipal?: string;
  },
): Promise<{
  trace_id: string;
  status: "completed" | "failed";
  closing_event_id: string;
  events: Array<{ event_id: string; action_kind: string; tool_name?: string }>;
}> {
  const run = await client.query<{
    agent_id: string;
    key_id: string;
    status: string;
    root_event_id: string | null;
  }>(
    `SELECT agent_id, key_id, status, root_event_id FROM workflow_run
     WHERE trace_id = $1 AND organization_id = $2`,
    [input.traceId, input.organizationId],
  );
  const row = run.rows[0];
  if (!row) {
    throw new Error("Workflow run not found");
  }
  if (row.status !== "running" && row.status !== "blocked") {
    throw new Error(`Workflow run is already ${row.status}`);
  }

  const bridge = await resolveBridgeKey(
    client,
    input.organizationId,
    row.agent_id,
    row.key_id,
  );
  if (!bridge) {
    throw new Error("Bridge signing key unavailable");
  }

  const steps: WorkflowStepInput[] = [
    ...(input.policy_gate ? [policyGateStep(input.policy_gate)] : []),
    ...(input.steps ?? []),
    ...((input.execution?.nodes ?? []).map(mapNodeToStep)),
  ];

  const appended =
    steps.length > 0
      ? await appendWorkflowSteps(client, {
          organizationId: input.organizationId,
          traceId: input.traceId,
          steps,
          actorPrincipal: input.actorPrincipal,
        })
      : { events: [] };

  const finalStatus = input.status ?? "completed";
  const actor = input.actorPrincipal ?? "workflow:n8n";

  const closeEvent: ApsEvent = {
    schema_version: 1,
    event_id: newEventId(),
    organization_id: input.organizationId,
    trace_id: input.traceId,
    agent_id: bridge.agentId,
    key_id: bridge.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: actor,
    action_kind: "provenance_claim",
    policy_decision: finalStatus === "completed" ? "allow" : "deny",
    tool_name: "aegis.provenance.claim",
    parent_event_id: appended.events.at(-1)?.event_id ?? row.root_event_id ?? undefined,
    payload: {
      claim:
        input.summary ??
        (finalStatus === "completed"
          ? "Workflow run completed with signed provenance."
          : "Workflow run failed."),
      authority: actor,
      business_context: input.summary,
      workflow_name: input.execution?.workflow_name,
      external_execution_id: input.execution?.execution_id,
      result_status: finalStatus === "completed" ? "ok" : "error",
      investor_summary:
        input.summary ??
        `n8n workflow ${finalStatus}: ${appended.events.length} step(s) recorded.`,
    },
  };

  const closing = await signAndPersist(
    client,
    closeEvent,
    bridge.privateKeyB64,
    bridge.keyId,
  );

  if (finalStatus === "completed") {
    await completeTrace(client, input.organizationId, input.traceId);
    await voidPendingApprovalsForTerminalTrace(
      client,
      input.organizationId,
      input.traceId,
    );
  } else {
    await client.query(
      `UPDATE trace
       SET status = 'failed', ended_at = now()
       WHERE organization_id = $1 AND trace_id = $2 AND status IN ('running', 'blocked', 'executing')`,
      [input.organizationId, input.traceId],
    );
    await voidPendingApprovalsForTerminalTrace(
      client,
      input.organizationId,
      input.traceId,
    );
  }

  await client.query(
    `UPDATE workflow_run
     SET status = $1, completed_at = now()
     WHERE trace_id = $2 AND organization_id = $3`,
    [finalStatus, input.traceId, input.organizationId],
  );

  return {
    trace_id: input.traceId,
    status: finalStatus,
    closing_event_id: closing.eventId,
    events: [
      ...appended.events,
      {
        event_id: closing.eventId,
        action_kind: "provenance_claim",
        tool_name: "aegis.provenance.claim",
      },
    ],
  };
}

export async function findOpenWorkflowRunByExternalExecution(
  client: pg.PoolClient,
  organizationId: string,
  externalSystem: string,
  externalExecutionId: string,
): Promise<{ trace_id: string; status: string } | null> {
  const result = await client.query<{ trace_id: string; status: string }>(
    `SELECT wr.trace_id, t.status
     FROM workflow_run wr
     JOIN trace t
       ON t.trace_id = wr.trace_id
      AND t.organization_id = wr.organization_id
     WHERE wr.organization_id = $1
       AND wr.external_system = $2
       AND wr.external_execution_id = $3
       AND t.status IN ('running', 'blocked', 'executing')
     ORDER BY wr.created_at DESC
     LIMIT 1`,
    [organizationId, externalSystem, externalExecutionId],
  );
  return result.rows[0] ?? null;
}

export async function getWorkflowRun(
  client: pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<{
  trace_id: string;
  status: string;
  agent_id: string;
  external_system: string;
  external_workflow_id: string | null;
  external_execution_id: string | null;
  root_event_id: string | null;
  created_at: string;
  completed_at: string | null;
} | null> {
  const result = await client.query<{
    trace_id: string;
    status: string;
    agent_id: string;
    external_system: string;
    external_workflow_id: string | null;
    external_execution_id: string | null;
    root_event_id: string | null;
    created_at: Date;
    completed_at: Date | null;
  }>(
    `SELECT trace_id, status, agent_id, external_system, external_workflow_id,
            external_execution_id, root_event_id, created_at, completed_at
     FROM workflow_run
     WHERE trace_id = $1 AND organization_id = $2`,
    [traceId, organizationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at?.toISOString() ?? null,
  };
}

/**
 * Record a policy gate as its own signed trace (enterprise audit):
 * who checked what tool, allow/deny, rule, reason — then close the run.
 */
export async function recordPolicyGateAsTrace(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    agentId: string;
    toolName: string;
    decision: PolicyDecision;
    policyId: string;
    ruleId: string | null;
    reason: string;
    engine?: string;
    externalSystem?: string;
    externalWorkflowId?: string;
    externalExecutionId?: string;
    actorPrincipal?: string;
  },
): Promise<{
  trace_id: string;
  status: "completed" | "failed";
  events: Array<{ event_id: string; action_kind: string; tool_name?: string }>;
}> {
  const denied = input.decision === "deny";
  const started = await startWorkflowRun(client, {
    organizationId: input.organizationId,
    agentId: input.agentId,
    businessContext: denied
      ? `Policy blocked ${input.toolName}`
      : `Policy allowed ${input.toolName}`,
    externalSystem: input.externalSystem ?? "n8n",
    externalWorkflowId: input.externalWorkflowId,
    externalExecutionId: input.externalExecutionId,
    triggerDetail: `policy_gate:${input.toolName}`,
    actorPrincipal: input.actorPrincipal ?? "workflow:n8n",
  });

  return completeWorkflowRun(client, {
    organizationId: input.organizationId,
    traceId: started.trace_id,
    status: denied ? "failed" : "completed",
    summary: denied
      ? `Blocked ${input.toolName} by ${input.ruleId ?? "policy"}: ${input.reason}`
      : `Allowed ${input.toolName}: ${input.reason}`,
    steps: [policyGateStep({
      tool_name: input.toolName,
      decision: input.decision,
      policy_id: input.policyId,
      rule_id: input.ruleId,
      reason: input.reason,
      engine: input.engine,
    })],
    actorPrincipal: input.actorPrincipal ?? "workflow:n8n",
  });
}

/**
 * Human approval required: open a blocked trace + Console approval (one trace).
 */
export async function recordPolicyObligationGate(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    agentId: string;
    toolName: string;
    policyId: string;
    ruleId: string | null;
    reason: string;
    engine?: string;
    externalSystem?: string;
    externalWorkflowId?: string;
    externalExecutionId?: string;
    actorPrincipal?: string;
    approvalFocusUrl?: string;
    /** Workflow item payload shown to approvers (amount, recipient, etc.). */
    requestPayload?: Record<string, unknown>;
  },
): Promise<{
  trace_id: string;
  status: "blocked";
  approval_id: string;
  events: Array<{ event_id: string; action_kind: string; tool_name?: string }>;
}> {
  const started = await startWorkflowRun(client, {
    organizationId: input.organizationId,
    agentId: input.agentId,
    businessContext: `Approval required: ${input.toolName}`,
    externalSystem: input.externalSystem ?? "n8n",
    externalWorkflowId: input.externalWorkflowId,
    externalExecutionId: input.externalExecutionId,
    triggerDetail: `policy_obligation:${input.toolName}`,
    actorPrincipal: input.actorPrincipal ?? "workflow:n8n",
  });

  const appended = await appendWorkflowSteps(client, {
    organizationId: input.organizationId,
    traceId: started.trace_id,
    steps: [
      policyGateStep(
        {
          tool_name: input.toolName,
          decision: "allow_with_obligation",
          policy_id: input.policyId,
          rule_id: input.ruleId,
          reason: input.reason,
          engine: input.engine,
        },
        input.requestPayload,
      ),
    ],
    actorPrincipal: input.actorPrincipal ?? "workflow:n8n",
  });

  const eventId = appended.events[0]?.event_id;
  if (!eventId) {
    throw new Error("Failed to record obligation policy step");
  }

  const { approval_id } = await createApprovalRequest(client, {
    organizationId: input.organizationId,
    eventId,
    traceId: started.trace_id,
    toolName: input.toolName,
    deferred: {
      url: input.approvalFocusUrl ?? "aegis://approvals/pending",
      method: "GET",
    },
  });

  return {
    trace_id: started.trace_id,
    status: "blocked",
    approval_id,
    events: appended.events,
  };
}
