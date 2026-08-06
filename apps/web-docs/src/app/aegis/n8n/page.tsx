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
        Signed APS-1 traces and live policy checks in n8n — without Ed25519 private keys in the
        orchestrator.
      </p>

      <div className="callout">
        <strong>Customer install (n8n):</strong> Settings → Community nodes → Install{" "}
        <code>n8n-nodes-salanor-aegis</code> → add credential → use{" "}
        <strong>Salanor Aegis</strong> (Record Run at the end; Check Policy before risky tools).
      </div>

      <h2>1. Install the Salanor node</h2>
      <ol>
        <li>
          In n8n: <strong>Settings → Community nodes → Install</strong>
        </li>
        <li>
          Package: <code>n8n-nodes-salanor-aegis</code>
        </li>
        <li>Accept the community-node risk prompt and install</li>
        <li>
          Create credential <strong>Salanor Aegis API</strong>: base URL{" "}
          <code>{api}</code>, ingest API key from the{" "}
          <a href={DOCS.consoleUrl}>console</a>
        </li>
        <li>
          Console → Agents → <strong>Enable Workflow Bridge</strong> (must show{" "}
          <strong>Workflow Bridge on</strong>)
        </li>
      </ol>

      <h2>2. Workflow shape</h2>
      <CodeBlock
        lang="text"
        title="Product pattern"
        code={`Trigger
  → … your nodes …
  → Salanor Aegis · Check Policy     # before payment / delete / send / apply
  → risky tool (only if allowed)
  → …
  → Salanor Aegis · Record Run       # once at the end → signed trace + trace_url`}
      />

      <p>
        <strong>Record Run</strong> is one call: Salanor starts, signs packed steps, and completes
        the trace. You do not call Aegis on every node.{" "}
        <strong>Check Policy</strong> is what can block an action <em>before</em> it runs.
      </p>

      <h2>3. Zapier / Make / plain HTTP</h2>
      <p>
        Same server API. One POST at the end (and optional policy evaluate before risk):
      </p>
      <CodeBlock
        lang="bash"
        title={`POST ${api}/v1/aegis/workflows/runs`}
        code={`curl -X POST ${api}/v1/aegis/workflows/runs \\
  -H "Authorization: Bearer $AEGIS_INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "one_shot": true,
    "business_context": "Content sync",
    "external_system": "zapier",
    "status": "completed",
    "execution": {
      "workflow_name": "Content Sync",
      "nodes": [
        { "name": "LLM", "kind": "llm", "output_preview": "…" },
        { "name": "Apply", "kind": "tool", "tool_name": "app.content.apply", "status": "success" }
      ]
    }
  }'`}
      />

      <h2>4. Verify</h2>
      <p>
        Open <code>trace_url</code> in <a href={DOCS.consoleUrl}>Console → Traces</a>. Status should
        be <strong>COMPLETED</strong> with signed steps (not stuck on{" "}
        <code>aegis.trace.start</code> only).
      </p>

      <h2>When to use the SDK instead</h2>
      <p>
        In-app agents (Node/Python) that must evaluate policy inside code: use{" "}
        <Link href="/aegis/sdk">@salanor/aegis</Link>. Orchestrators use this page. Same console.
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
