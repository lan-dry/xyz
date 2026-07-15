import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Getting started" };

export default function GettingStartedPage() {
  const ingestUrl = `${DOCS.apiBaseUrl}${DOCS.apiIngestPath}`;

  return (
    <>
      <h1>Getting started</h1>
      <p className="lead">
        Integrate Aegis into <strong>your application</strong> — your repo, your deploy, your
        servers. You do not clone the Salanor monorepo or run our internal <code>pnpm dev</code>.
      </p>

      <div className="callout">
        <strong>Who this guide is for:</strong> engineers at a customer company who received
        console access and need to send signed events from a service, worker, or agent.
      </div>

      <h2>1. Get credentials in the console</h2>
      <p>
        Your org admin (or you, after signup) uses the{" "}
        <a href={DOCS.consoleUrl}>Salanor console</a>:
      </p>
      <ol>
        <li>
          <strong>Sign up / sign in</strong> — create your organization or accept an invite.
        </li>
        <li>
          <strong>API keys</strong> — create an <em>ingest API key</em>. Copy the secret once; store
          it in your vault (e.g. <code>AEGIS_INGEST_API_KEY</code>).
        </li>
        <li>
          <strong>Agents</strong> — create or select an agent. Export the <strong>Ed25519 signing
          key</strong> (private key base64, <code>key_id</code>, <code>agent_id</code>,
          <code>organization_id</code>).
        </li>
        <li>
          Optional: <strong>Policies</strong> — define which tools are allowed, denied, or require
          human approval.
        </li>
      </ol>

      <h2>2. Install the SDK in your project</h2>
      <p>
        Pick your language on the <Link href="/aegis/sdk">SDK overview</Link>. TypeScript is
        recommended for full policy proxy support; Python and Go support sign + ingest today.
      </p>
      <p>
        TypeScript / Node example — in <em>your</em> repository:
      </p>
      <CodeBlock
        lang="bash"
        title="Your project"
        code={`npm install ${DOCS.npmPackage}
# or
pnpm add ${DOCS.npmPackage}`}
      />

      <h2>3. Configure environment variables</h2>
      <p>
        Set these in your app&apos;s deployment (Kubernetes secret, Vercel env, <code>.env</code> on
        your laptop — whatever you already use):
      </p>
      <CodeBlock
        lang="bash"
        title=".env (your app)"
        code={`AEGIS_API_URL=${DOCS.apiBaseUrl}
AEGIS_INGEST_API_KEY=aegis_xxxxxxxx   # from console
ORGANIZATION_ID=uuid-from-console
AGENT_ID=agt_xxxxxxxx
KEY_ID=key_xxxxxxxx
SIGNING_PRIVATE_KEY_B64=base64-from-console-export`}
      />
      <p>
        Set <code>AEGIS_API_URL</code> to your Salanor API base (production:{" "}
        <code>{DOCS.apiBaseUrl}</code>). Ingest routes live under <code>/v1/aegis</code> — full
        ingest URL: <code>{ingestUrl}</code>.
      </p>

      <h2>4. Send your first signed event</h2>
      <p>
        Add this to a route, worker, or script in <strong>your</strong> codebase:
      </p>
      <CodeBlock
        lang="typescript"
        title="your-app/src/aegis.ts"
        code={`import { signAndIngest } from "${DOCS.npmPackage}";

export async function recordLlmStep(traceId: string, prompt: string, response: string) {
  return signAndIngest(
    {
      schema_version: 1,
      event_id: \`evt_\${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}\`,
      organization_id: process.env.ORGANIZATION_ID!,
      trace_id: traceId,
      agent_id: process.env.AGENT_ID!,
      key_id: process.env.KEY_ID!,
      emitted_at: new Date().toISOString(),
      actor_type: "agent",
      actor_principal: "my-support-bot",
      action_kind: "llm_invocation",
      policy_decision: "allow",
      tool_name: "openai.chat.completions",
      payload: {
        purpose: "support_triage",
        data_touched: ["ticket_message"],
        data_classification: "pii",
      },
    },
    {
      privateKeyB64: process.env.SIGNING_PRIVATE_KEY_B64!,
      keyId: process.env.KEY_ID!,
    },
    {
      apiBaseUrl: process.env.AEGIS_API_URL!,
      ingestApiKey: process.env.AEGIS_INGEST_API_KEY!,
    },
  );
}`}
      />

      <h2>5. Gate outbound tools (payments, APIs)</h2>
      <p>
        Wrap dangerous HTTP calls with <code>wrapFetch</code> so policy runs before the request
        leaves your process. See <Link href="/aegis/sdk/typescript">TypeScript SDK</Link>.
      </p>

      <h2>6. Verify in the console</h2>
      <p>
        Open <a href={DOCS.consoleUrl}>Console → Traces</a>. You should see your{" "}
        <code>trace_id</code> with signed events and a valid hash chain.
      </p>

      <h2>What you do not need</h2>
      <ul>
        <li>
          <code>cd salanor</code>, <code>docker compose</code>, or <code>pnpm dev</code> — those are
          for Salanor engineers running the platform locally.
        </li>
        <li>
          Access to the Salanor GitHub monorepo — only the npm package (or HTTP API) in your app.
        </li>
      </ul>
      <p>
        Salanor staff: local stack setup lives in the monorepo{" "}
        <code>docs-internal/LOCAL_DEVELOPMENT.md</code> and Platform Ops → Commands.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href="/aegis/events/envelope">APS event envelope</Link> — required fields
        </li>
        <li>
          <Link href="/aegis/api/events">POST /events</Link> — if you skip the SDK and use HTTP
          directly
        </li>
        <li>
          <Link href="/aegis/events/payload">Payload conventions</Link> — audit-friendly metadata
        </li>
      </ul>
    </>
  );
}
