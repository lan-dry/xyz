import type { Metadata } from "next";

import { ParamTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = { title: "APS envelope" };

export default function EventEnvelopePage() {
  return (
    <>
      <h1>APS-1 event envelope</h1>
      <p className="lead">
        Every ingested record is a versioned JSON object, canonicalized and signed with Ed25519
        before POST. Field names below are required unless marked optional.
      </p>

      <h2>Core fields</h2>
      <ParamTable
        rows={[
          { name: "schema_version", type: "number", required: true, description: "Always 1 for current APS draft" },
          { name: "event_id", type: "string", required: true, description: "Unique id, e.g. evt_…" },
          { name: "organization_id", type: "uuid", required: true, description: "Tenant scope" },
          { name: "trace_id", type: "string", required: true, description: "Groups related events in one workflow" },
          { name: "agent_id", type: "string", required: true, description: "Registered agent" },
          { name: "key_id", type: "string", required: true, description: "Signing key used" },
          { name: "emitted_at", type: "ISO8601", required: true, description: "Agent clock at emission" },
          { name: "actor_type", type: "enum", required: true, description: "agent | human | system" },
          { name: "actor_principal", type: "string", required: true, description: "Service account or user label" },
          { name: "action_kind", type: "enum", required: true, description: "llm_invocation | policy_decision | tool_call | human_approval | result" },
          { name: "policy_decision", type: "enum", required: true, description: "allow | deny | allow_with_obligation | allow_retro_audit" },
          { name: "payload", type: "object", required: true, description: "Action-specific JSON — see Payload conventions" },
          { name: "tool_name", type: "string", required: false, description: "Stable tool id for policy matching" },
          { name: "parent_event_id", type: "string", required: false, description: "Links child steps in a trace" },
          { name: "policy_id", type: "string", required: false, description: "Set when policy engine attributed a rule" },
          { name: "sig_alg", type: "string", required: true, description: "ed25519 (after signing)" },
          { name: "sig_value_b64", type: "string", required: true, description: "Base64 signature (after signing)" },
        ]}
      />

      <h2>action_kind usage</h2>
      <ul>
        <li><code>llm_invocation</code> — model read/generate; put <code>data_touched</code> in payload</li>
        <li><code>policy_decision</code> — emitted by wrapFetch before tool execution</li>
        <li><code>result</code> — HTTP outcome after allowed tool call</li>
        <li><code>human_approval</code> — console approval action</li>
      </ul>

      <h2>Minimal example (pre-signature)</h2>
      <CodeBlock
        lang="json"
        code={`{
  "schema_version": 1,
  "event_id": "evt_001",
  "organization_id": "00000000-0000-0000-0000-000000000001",
  "trace_id": "trc_001",
  "agent_id": "agt_001",
  "key_id": "key_001",
  "emitted_at": "2026-05-21T12:00:00.000Z",
  "actor_type": "agent",
  "actor_principal": "worker-1",
  "action_kind": "llm_invocation",
  "policy_decision": "allow",
  "tool_name": "openai.chat",
  "payload": { "purpose": "summarize" }
}`}
      />
    </>
  );
}
