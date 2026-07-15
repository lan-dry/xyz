import type { Metadata } from "next";

import { ApiEndpoint, ParamTable, ResponseTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Ingest events" };

export default function ApiEventsPage() {
  return (
    <>
      <h1>Ingest events</h1>
      <p className="lead">
        Submit a signed APS-1 event to the organization ledger. Prefer{" "}
        <code>signAndIngest</code> from the SDK — it handles canonical JSON and Ed25519 signing.
      </p>

      <ApiEndpoint
        method="POST"
        path="/v1/aegis/events"
        auth="Bearer ingest key"
      />

      <h2>Request body</h2>
      <p>
        Full signed <a href="/aegis/events/envelope">APS envelope</a> including{" "}
        <code>sig_alg</code> and <code>sig_value_b64</code> after signing.
      </p>
      <CodeBlock
        lang="json"
        title="Example (abbreviated)"
        code={`{
  "schema_version": 1,
  "event_id": "evt_a1b2c3d4e5f6",
  "organization_id": "uuid",
  "trace_id": "trc_a1b2c3d4",
  "agent_id": "agt_…",
  "key_id": "key_…",
  "emitted_at": "2026-05-21T12:00:00.000Z",
  "actor_type": "agent",
  "actor_principal": "support-bot",
  "action_kind": "llm_invocation",
  "policy_decision": "allow",
  "tool_name": "google.generativeai.classify",
  "payload": {
    "purpose": "triage",
    "data_touched": ["customer_email", "ticket_message"]
  },
  "sig_alg": "ed25519",
  "sig_value_b64": "…"
}`}
      />

      <h2>Request headers</h2>
      <ParamTable
        rows={[
          {
            name: "Authorization",
            type: "string",
            required: true,
            description: "Bearer ingest API key",
          },
          {
            name: "Idempotency-Key",
            type: "string",
            required: false,
            description: "Stable key; replays return 200 with status replayed",
          },
          {
            name: "Salanor-Version",
            type: "string",
            required: false,
            description: "API version date (SDK sends 2026-05-18)",
          },
        ]}
      />

      <h2>Responses</h2>
      <ResponseTable
        rows={[
          {
            status: "201 Created",
            body: "{ event_id, sequence_num, event_hash, chain_valid, status: \"created\" }",
          },
          {
            status: "200 OK",
            body: "{ event_id, status: \"replayed\" } — idempotent duplicate",
          },
          {
            status: "401",
            body: "{ error: \"Invalid API key\" }",
          },
          {
            status: "403",
            body: "{ error: \"Organization mismatch…\" }",
          },
          {
            status: "422",
            body: "{ error: \"Invalid signature\" | validation message }",
          },
          {
            status: "429",
            body: "{ error, code: \"plan_limit\" } — monthly event cap",
          },
        ]}
      />

      <h2>cURL example</h2>
      <CodeBlock
        lang="bash"
        code={`curl -X POST ${DOCS.apiBaseUrl}/v1/aegis/events \\
  -H "Authorization: Bearer $AEGIS_INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Salanor-Version: 2026-05-18" \\
  -d @signed-event.json`}
      />

      <h2>Server-side policy on ingest</h2>
      <p>
        If <code>tool_name</code> is set, the API may upgrade <code>policy_decision</code> to{" "}
        <code>deny</code> or <code>allow_with_obligation</code> based on the org&apos;s active
        policy before persisting.
      </p>
    </>
  );
}
