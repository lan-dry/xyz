import type { Metadata } from "next";

import { ApiEndpoint, ParamTable, ResponseTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Approvals" };

export default function ApiApprovalsPage() {
  return (
    <>
      <h1>Approvals API</h1>
      <p className="lead">
        When policy returns <code>allow_with_obligation</code>, the agent must request approval
        before executing the deferred HTTP call. Humans approve in the console.
      </p>

      <h2>Request approval</h2>
      <ApiEndpoint
        method="POST"
        path="/v1/aegis/approvals/request"
        auth="Bearer ingest key"
      />
      <ParamTable
        rows={[
          { name: "organization_id", type: "uuid", required: true, description: "Org scope" },
          { name: "event_id", type: "string", required: true, description: "Policy decision event ID" },
          { name: "trace_id", type: "string", required: true, description: "Trace to complete later" },
          { name: "tool_name", type: "string", required: true, description: "Tool awaiting approval" },
          {
            name: "deferred",
            type: "{ url, method? }",
            required: true,
            description: "HTTP call to run after approval (method defaults to GET)",
          },
        ]}
      />
      <CodeBlock
        lang="json"
        code={`{
  "organization_id": "…",
  "event_id": "evt_…",
  "trace_id": "trc_…",
  "tool_name": "stripe.paymentIntents.create",
  "deferred": { "url": "https://api.stripe.com/…", "method": "POST" }
}`}
      />
      <ResponseTable
        rows={[
          { status: "201", body: "{ approval_id, status: \"pending\", … }" },
          { status: "422", body: "Missing required fields" },
        ]}
      />

      <h2>Get approval status</h2>
      <ApiEndpoint
        method="GET"
        path="/v1/aegis/approvals/:approvalId"
        auth="Bearer ingest key"
      />
      <CodeBlock
        lang="json"
        title="200 response"
        code={`{
  "approval_id": "apr_…",
  "status": "pending" | "approved" | "rejected",
  "trace_id": "trc_…",
  "tool_name": "stripe.paymentIntents.create",
  "event_id": "evt_…"
}`}
      />

      <h2>Complete trace</h2>
      <ApiEndpoint
        method="POST"
        path="/v1/aegis/approvals/:approvalId/complete"
        auth="Bearer ingest key"
      />
      <p>
        Call after deferred fetch succeeds and approval is <code>approved</code>. Marks trace
        completed. Body may include <code>trace_id</code> and <code>organization_id</code>.
      </p>
      <ResponseTable
        rows={[
          { status: "200", body: "{ ok: true, trace_id, status: \"completed\" }" },
          { status: "409", body: "Approval not approved" },
          { status: "404", body: "Not found" },
        ]}
      />

      <h2>SDK resume</h2>
      <CodeBlock
        lang="typescript"
        code={`import { wrapFetchResume } from "${DOCS.npmPackage}";

await wrapFetchResume(approvalId, url, init, config);`}
      />
    </>
  );
}
