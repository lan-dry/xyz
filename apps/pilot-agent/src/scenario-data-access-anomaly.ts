/**
 * Demo: agent reads sensitive fields, then an anomaly signal flags prompt-injection
 * indicators and can require a person (Ask a person).
 */
import { randomUUID } from "node:crypto";
import {
  newTraceId,
  recordAnomalySignal,
  recordDataAccess,
  recordTraceComplete,
  recordTraceStart,
  requestApprovalViaApi,
  signAndIngest,
  type ApsEvent,
} from "@salanor/aegis";

import type { PilotConfig } from "./config.js";

export async function runDataAccessAnomalyScenario(
  config: PilotConfig,
  opts?: { requireApproval?: boolean },
): Promise<{
  mode: "ask_person" | "stopped";
  trace_id: string;
  data_access_event_id: string;
  anomaly_event_id: string;
  approval_id?: string;
  console_trace_url: string;
  console_approvals_url?: string;
}> {
  const requireApproval = opts?.requireApproval ?? true;
  const traceId = newTraceId();
  const ctx = {
    organizationId: config.organizationId,
    agentId: config.agentId,
    keyId: config.keyId,
    actorPrincipal: config.actorPrincipal,
    traceId,
  };
  const sign = { privateKeyB64: config.privateKeyB64, keyId: config.keyId };
  const ingest = {
    apiBaseUrl: config.apiBaseUrl,
    ingestApiKey: config.ingestApiKey,
  };
  const consoleTraceUrl = `http://localhost:3000/aegis/traces/${encodeURIComponent(traceId)}`;

  console.log("\n=== Pilot agent: data access + anomaly signal ===");
  console.log(`Trace ID: ${traceId}\n`);

  await recordTraceStart(
    ctx,
    {
      triggerSource: "support_ticket",
      triggerDetail: "Customer asked for full file export",
      businessContext: "Sensitive data access review",
    },
    { sign, ingest },
  );

  const accessEventId = await recordDataAccess(
    ctx,
    {
      operation: "read",
      resource: "customer.profile",
      fieldsAccessed: ["full_name", "national_id", "account_number", "email"],
      sensitivity: "high",
      source: "retrieval",
    },
    { sign, ingest },
  );

  const anomalyEventId = await recordAnomalySignal(
    ctx,
    {
      type: "prompt_injection_indicator",
      reason:
        "Ticket text asked the agent to ignore policy and export the full customer file.",
      severity: "high",
      linkedEventId: accessEventId,
      requireApproval,
    },
    { sign, ingest },
  );

  const decisionEventId = `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const decision: ApsEvent = {
    schema_version: 1,
    event_id: decisionEventId,
    organization_id: config.organizationId,
    trace_id: traceId,
    agent_id: config.agentId,
    key_id: config.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: config.actorPrincipal,
    action_kind: "policy_decision",
    policy_decision: requireApproval ? "allow_with_obligation" : "deny",
    tool_name: "aegis.data.read",
    parent_event_id: anomalyEventId,
    payload: {
      policy_id: "pol-data-access-demo",
      rule_id: "rule_sensitive_data_hold",
      reason: requireApproval
        ? "High-sensitivity data access after a prompt-injection indicator — ask a person."
        : "High-sensitivity data access after a prompt-injection indicator — stopped.",
      evaluation_context: {
        customer_tier: "standard",
        product_type: "support",
        previous_pattern: "first_sensitive_export_request",
        risk_tier: "high",
        sensitivity: "high",
        resource: "customer.profile",
        fields_accessed: [
          "full_name",
          "national_id",
          "account_number",
          "email",
        ],
      },
      decision_layer: "contextual",
      ...(requireApproval
        ? {
            deferred_request: {
              url: "aegis://approvals/pending",
              method: "GET",
            },
            obligation_tool: "aegis.data.read",
          }
        : {}),
    },
  };
  await signAndIngest(decision, sign, ingest);

  if (requireApproval) {
    const { approval_id } = await requestApprovalViaApi(
      config.apiBaseUrl,
      config.ingestApiKey,
      {
        organization_id: config.organizationId,
        event_id: decisionEventId,
        trace_id: traceId,
        tool_name: "aegis.data.read",
        deferred: { url: "aegis://approvals/pending", method: "GET" },
      },
    );
    const approvalsUrl = `http://localhost:3000/aegis/approvals?focus=${encodeURIComponent(approval_id)}`;

    console.log(`OK  data_access + anomaly_signal`);
    console.log(`    Console receipt: ${consoleTraceUrl}`);
    console.log(`    Approvals:       ${approvalsUrl}`);
    console.log(`    Outcome: Paused for approval (Ask a person)`);
    console.log(
      `\nOpen the receipt URL, scroll the page, then open Approvals to decide.`,
    );

    return {
      mode: "ask_person",
      trace_id: traceId,
      data_access_event_id: accessEventId,
      anomaly_event_id: anomalyEventId,
      approval_id,
      console_trace_url: consoleTraceUrl,
      console_approvals_url: approvalsUrl,
    };
  }

  await recordTraceComplete(
    ctx,
    {
      summary: "Stopped after anomaly",
      outcome: "error",
    },
    { sign, ingest },
  );

  console.log(`OK  data_access + anomaly_signal`);
  console.log(`    Console: ${consoleTraceUrl}`);
  console.log(`    Outcome: Stop (deny)`);

  return {
    mode: "stopped",
    trace_id: traceId,
    data_access_event_id: accessEventId,
    anomaly_event_id: anomalyEventId,
    console_trace_url: consoleTraceUrl,
  };
}
