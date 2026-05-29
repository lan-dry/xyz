import type { Metadata } from "next";

import { ApiEndpoint, ParamTable, ResponseTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Policy evaluate" };

export default function ApiPolicyPage() {
  return (
    <>
      <h1>Policy evaluate</h1>
      <p className="lead">
        Evaluate organization policy for a tool name without executing the tool.{" "}
        <code>wrapFetch</code> calls this internally before outbound HTTP.
      </p>

      <ApiEndpoint
        method="POST"
        path="/v1/aegis/policy/evaluate"
        auth="Bearer ingest key"
      />

      <h2>Request body</h2>
      <ParamTable
        rows={[
          {
            name: "organization_id",
            type: "uuid",
            required: true,
            description: "Must match the API key organization",
          },
          {
            name: "agent_id",
            type: "string",
            required: true,
            description: "Agent performing the action",
          },
          {
            name: "tool_name",
            type: "string",
            required: true,
            description: "Stable tool identifier, e.g. stripe.paymentIntents.create",
          },
          {
            name: "payload",
            type: "object",
            required: false,
            description: "Optional context for conditional rules (amount_usd, etc.)",
          },
        ]}
      />

      <CodeBlock
        lang="json"
        code={`{
  "organization_id": "62a6c75a-41a1-43e2-a01f-87b5ebe374ff",
  "agent_id": "agt_e36f62a0e93747679a43a550",
  "tool_name": "stripe.paymentIntents.create",
  "payload": { "amount_usd": 249, "currency": "USD" }
}`}
      />

      <h2>Success response (200)</h2>
      <CodeBlock
        lang="json"
        code={`{
  "decision": "deny",
  "policy_id": "pol_…",
  "rule_id": "rule_…",
  "reason": "matched deny rule for stripe.paymentIntents.create",
  "engine": "rules"
}`}
      />
      <p>
        <code>decision</code> is one of: <code>allow</code>, <code>deny</code>,{" "}
        <code>allow_with_obligation</code>. When no active policy exists, default is{" "}
        <code>allow</code> with <code>policy_id: "none"</code>.
      </p>

      <h2>Errors</h2>
      <ResponseTable
        rows={[
          { status: "401", body: "Invalid ingest API key" },
          { status: "403", body: "Organization mismatch for API key" },
          { status: "422", body: "Missing organization_id, agent_id, or tool_name" },
        ]}
      />

      <h2>cURL</h2>
      <CodeBlock
        lang="bash"
        code={`curl -X POST ${DOCS.apiBaseUrl}/v1/aegis/policy/evaluate \\
  -H "Authorization: Bearer $AEGIS_INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"organization_id":"…","agent_id":"…","tool_name":"stripe.paymentIntents.create"}'`}
      />
    </>
  );
}
