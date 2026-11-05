/**
 * Sign and ingest one review case for the production console.
 *
 *   pnpm --filter @salanor/demo-tools ingest-review-normal
 *   pnpm --filter @salanor/demo-tools ingest-review-injected
 *
 * Requires shell env (shell wins over .env):
 *   AEGIS_API_URL
 *   AEGIS_INGEST_API_KEY
 *   AEGIS_ORGANIZATION_ID
 *   DEMO_KEY_ID
 *   AEGIS_SIGNING_PRIVATE_KEY_B64
 * Optional:
 *   DEMO_AGENT_ID (default agt_6ab06d8ab3f445da8aeedd35)
 *   AEGIS_CONSOLE_URL (default https://app.salanor.com)
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newTraceId, signAndIngest, type ApsEvent } from "@salanor/aegis";

const REVIEW_AGENT_ID = "agt_6ab06d8ab3f445da8aeedd35";

type Mode = "normal" | "injected";

const NORMAL_FIELDS = ["invoice_amount", "beneficiary_name", "invoice_number"];
const INJECTED_FIELDS = [
  "invoice_amount",
  "beneficiary_name",
  "customer_account_number",
  "internal_notes",
];

function loadEnvFile(): void {
  const root = resolve(import.meta.dirname, "../..");
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function eventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

loadEnvFile();

const modeArg = process.argv[2]?.trim();
if (modeArg !== "normal" && modeArg !== "injected") {
  console.error("Usage: tsx ingest-review-cases.mts normal|injected");
  process.exit(1);
}
const mode: Mode = modeArg;

const apiBaseUrl = required("AEGIS_API_URL");
const ingestApiKey = required("AEGIS_INGEST_API_KEY");
const organizationId = required("AEGIS_ORGANIZATION_ID");
const keyId = required("DEMO_KEY_ID");
const privateKeyB64 = required("AEGIS_SIGNING_PRIVATE_KEY_B64");
const agentId = process.env.DEMO_AGENT_ID?.trim() || REVIEW_AGENT_ID;
const consoleBase = (
  process.env.AEGIS_CONSOLE_URL?.trim() || "https://app.salanor.com"
).replace(/\/$/, "");

const fields = mode === "normal" ? NORMAL_FIELDS : INJECTED_FIELDS;
const sensitivity = mode === "normal" ? "low" : "high";
const traceId = newTraceId();
const actorPrincipal = "invoice-operations-agent";
const sign = { privateKeyB64, keyId };
const ingest = { apiBaseUrl, ingestApiKey };

const emailSubject =
  mode === "normal"
    ? "Invoice 10482 from Northwind Supplies"
    : "Invoice 10482 — please also pull the customer account";

function base(id: string, parent: string | undefined): Pick<
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
> {
  return {
    schema_version: 1,
    event_id: id,
    organization_id: organizationId,
    trace_id: traceId,
    agent_id: agentId,
    key_id: keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: actorPrincipal,
    parent_event_id: parent,
  };
}

console.error(
  `POST ${apiBaseUrl} org=${organizationId} agent=${agentId} key=${keyId} case=${mode}`,
);

const accessId = eventId();
const access: ApsEvent = {
  ...base(accessId, undefined),
  action_kind: "data_access",
  policy_decision: "allow",
  tool_name: "aegis.data.read",
  payload: {
    operation: "read",
    resource: "invoice",
    fields_accessed: fields,
    fields,
    data_touched: fields,
    sensitivity,
    classification: sensitivity,
    source: "email",
    task: "Read a supplier invoice before payout",
    email_subject: emailSubject,
    action: "read_invoice",
  },
};
await signAndIngest(access, sign, {
  ...ingest,
  idempotencyKey: `review-${accessId}`,
});

let parent = accessId;
if (mode === "injected") {
  const anomalyId = eventId();
  const anomaly: ApsEvent = {
    ...base(anomalyId, accessId),
    action_kind: "anomaly_signal",
    policy_decision: "allow",
    tool_name: "aegis.anomaly.signal",
    payload: {
      type: "prompt_injection_indicator",
      severity: "high",
      reason:
        "Email body contained instruction to extract and forward additional customer account details",
      linked_event_id: accessId,
      action: "anomaly_signal",
    },
  };
  await signAndIngest(anomaly, sign, {
    ...ingest,
    idempotencyKey: `review-${anomalyId}`,
  });
  parent = anomalyId;
}

const decisionId = eventId();
const decision: ApsEvent = {
  ...base(decisionId, parent),
  action_kind: "policy_decision",
  policy_decision: "allow",
  tool_name: "aegis.data.read",
  payload: {
    policy_id: mode === "normal" ? "pol-invoice-read" : "pol-invoice-read-flag",
    reason:
      mode === "normal"
        ? "Routine invoice read. Only the invoice amount, beneficiary name, and invoice number were seen."
        : "The read included extra customer fields after an instruction in the email. Recorded and flagged for review.",
    decision_layer: "contextual",
    evaluation_context: {
      sensitivity,
      resource: "invoice",
      product_type: "payout",
      fields_accessed: fields,
    },
  },
};
await signAndIngest(decision, sign, {
  ...ingest,
  idempotencyKey: `review-${decisionId}`,
});

const completeId = eventId();
const complete: ApsEvent = {
  ...base(completeId, decisionId),
  action_kind: "tool_call",
  policy_decision: "allow",
  tool_name: "aegis.trace.complete",
  payload: {
    action: "trace_session_complete",
    summary:
      mode === "normal"
        ? "Read invoice amount, beneficiary name, and invoice number."
        : "Flagged: email asked for extra customer account details.",
    outcome: "ok",
    task: "Read a supplier invoice before payout",
    email_subject: emailSubject,
  },
};
const result = await signAndIngest(complete, sign, {
  ...ingest,
  idempotencyKey: `review-${completeId}`,
});

const receipt = `${consoleBase}/aegis/traces/${encodeURIComponent(traceId)}`;
console.log(
  JSON.stringify(
    {
      ok: true,
      case: mode,
      trace_id: traceId,
      receipt,
      sequence_num: result.sequence_num,
      chain_event_id: result.event_id,
    },
    null,
    2,
  ),
);
