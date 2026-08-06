import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "n8n & orchestrators" };

export default function N8nOrchestratorsPage() {
  const api = DOCS.apiBaseUrl;

  return (
    <>
      <h1>n8n &amp; orchestrators</h1>
      <p className="lead">
        Full signed traces for n8n, Zapier, or Make — <strong>without</strong> calling Aegis on every
        node and <strong>without</strong> storing signing keys in the orchestrator.
      </p>

      <div className="callout">
        <strong>Least effort:</strong> Enable Workflow Bridge once on an agent, add <em>Start</em>{" "}
        + <em>Complete</em> HTTP nodes, pack steps in one Code node at the end. Salanor signs
        server-side.
      </div>

      <h2>1. One-time setup</h2>
      <ol>
        <li>
          Create an ingest API key in the{" "}
          <a href={DOCS.consoleUrl}>console</a>.
        </li>
        <li>
          Agents → <strong>Enable Workflow Bridge</strong> (server-held signing key).
        </li>
        <li>
          In n8n, create Header Auth: <code>Authorization: Bearer aegis_…</code>
        </li>
        <li>
          Set env <code>AEGIS_API_URL={api}</code>
        </li>
      </ol>

      <h2>2. Per workflow (2 HTTP nodes)</h2>
      <CodeBlock
        lang="text"
        title="Shape"
        code={`Trigger
  → Aegis Start Trace     POST /v1/aegis/workflows/runs
  → … your existing nodes (unchanged) …
  → Pack steps (Code)     map OpenAI / tools once
  → Aegis Complete Trace  POST /v1/aegis/workflows/runs/{trace_id}/complete`}
      />

      <h3>Start</h3>
      <CodeBlock
        lang="bash"
        title="POST /v1/aegis/workflows/runs"
        code={`curl -X POST ${api}/v1/aegis/workflows/runs \\
  -H "Authorization: Bearer $AEGIS_INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "business_context": "Content sync",
    "external_system": "n8n",
    "external_execution_id": "12345"
  }'`}
      />

      <h3>Complete (pack all steps here)</h3>
      <CodeBlock
        lang="json"
        title="Body"
        code={`{
  "status": "completed",
  "summary": "Dry-run OK",
  "execution": {
    "workflow_name": "Content Sync",
    "execution_id": "12345",
    "nodes": [
      {
        "name": "OpenAI",
        "kind": "llm",
        "purpose": "Propose updates",
        "input_preview": "…",
        "output_preview": "…"
      },
      {
        "name": "Apply",
        "kind": "tool",
        "tool_name": "app.content.apply",
        "status": "success",
        "output_preview": "4 updates"
      }
    ]
  }
}`}
      />

      <h2>3. Import the starter</h2>
      <p>
        Use the Salanor template <code>examples/n8n/aegis-workflow-bridge.json</code> (from your
        Salanor contact or docs package). Replace the middle “Your workflow work” node with your
        real steps; keep Start / Pack / Complete.
      </p>

      <h2>4. Verify</h2>
      <p>
        Open the <code>trace_url</code> from the Complete response in{" "}
        <a href={DOCS.consoleUrl}>Console → Traces</a>. You get an expandable signed timeline and
        replay — the same provenance buyers expect from SDK integrations.
      </p>

      <h2>When to use the SDK instead</h2>
      <p>
        If you write Node/Python agent code and need <strong>policy before</strong> a payment tool
        runs, use <Link href="/aegis/sdk">@salanor/aegis</Link> with{" "}
        <code>wrapFetch</code>. Orchestrators use Workflow Bridge; apps use the SDK. Same console.
      </p>

      <h2>Next</h2>
      <ul>
        <li>
          <Link href="/aegis/getting-started">Getting started (SDK)</Link>
        </li>
        <li>
          <Link href="/aegis/api">HTTP API overview</Link>
        </li>
      </ul>
    </>
  );
}
