import type { Metadata } from "next";

import { ApiEndpoint, ResponseTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Public verify" };

export default function ApiPublicPage() {
  return (
    <>
      <h1>Public verify API</h1>
      <p className="lead">
        Unauthenticated endpoints for transparency log head, per-event verification bundles, and
        agent DID documents. Used by public verify links in the console.
      </p>

      <h2>Transparency log head</h2>
      <ApiEndpoint
        method="GET"
        path="/v1/public/orgs/:slug/transparency/head"
        auth="None"
      />
      <CodeBlock
        lang="json"
        title="200"
        code={`{
  "organization_slug": "acme",
  "tree_size": 42,
  "latest_log_index": 41,
  "latest_leaf_hash": "…",
  "latest_published_at": "2026-05-21T12:00:00.000Z"
}`}
      />

      <h2>Verify event (public bundle)</h2>
      <ApiEndpoint
        method="GET"
        path="/v1/public/orgs/:slug/verify/:eventId"
        auth="None"
      />
      <p>
        Query <code>?verify=1</code> to include inline <code>verification</code> result (
        <code>chain_ok</code>, <code>inclusion_ok</code>).
      </p>
      <CodeBlock
        lang="bash"
        code={`curl "${DOCS.apiBaseUrl}/v1/public/orgs/acme/verify/evt_abc123?verify=1"`}
      />

      <h2>Agent DID document</h2>
      <ApiEndpoint method="GET" path="/v1/public/agents/:agentId/did" auth="None" />
      <ApiEndpoint method="GET" path="/v1/public/did/:did" auth="None" />

      <h2>Errors</h2>
      <ResponseTable rows={[{ status: "404", body: "{ error: \"Not found\" }" }]} />
    </>
  );
}
