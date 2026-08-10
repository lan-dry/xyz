import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "LangGraph integration" };

export default function LangGraphPage() {
  const api = DOCS.apiBaseUrl;

  return (
    <>
      <h1>LangGraph integration</h1>
      <p className="lead">
        Wrap LangGraph tool nodes with Aegis policy checks and BYOK-signed APS-1 events.
      </p>

      <h2>BYOK setup</h2>
      <ol>
        <li>Console → Agents → create agent or register BYOK public key.</li>
        <li>Store signing private key in your runtime secrets (never in git).</li>
        <li>Create ingest API key in Console → API keys.</li>
      </ol>

      <CodeBlock
        lang="typescript"
        code={`import { createGovernanceBridge, wrapLangGraphTool } from "@salanor/aegis";

const bridge = createGovernanceBridge({
  apiBaseUrl: "${api}",
  ingestApiKey: process.env.AEGIS_INGEST_API_KEY!,
  organizationId: process.env.AEGIS_ORGANIZATION_ID!,
  agentId: process.env.AEGIS_AGENT_ID!,
  keyId: process.env.AEGIS_KEY_ID!,
  privateKeyB64: process.env.AEGIS_SIGNING_PRIVATE_KEY_B64!,
  actorPrincipal: "langgraph-agent",
});

const transferFunds = wrapLangGraphTool(bridge, {
  toolName: "app.payments.transfer",
  description: "Transfer funds after policy check",
  handler: async (input: { amount_usd: number }) => {
    return { ok: true, amount_usd: input.amount_usd };
  },
});

// Use transferFunds inside your LangGraph node — policy + signed events run automatically.`}
      />

      <CodeBlock
        lang="typescript"
        title="Manual policy check"
        code={`import { createGovernanceBridge, evaluatePolicyViaApi } from "@salanor/aegis";

const bridge = createGovernanceBridge({
  apiBaseUrl: "${api}",
  ingestApiKey: process.env.AEGIS_INGEST_API_KEY!,
  organizationId: process.env.AEGIS_ORGANIZATION_ID!,
  agentId: process.env.AEGIS_AGENT_ID!,
  keyId: process.env.AEGIS_KEY_ID!,
  privateKeyB64: process.env.AEGIS_SIGNING_PRIVATE_KEY_B64!,
});

await bridge.withTrace({ businessContext: "langgraph-flow" }, async () => {
  const decision = await evaluatePolicyViaApi(
    "${api}",
    process.env.AEGIS_INGEST_API_KEY!,
    {
      organization_id: process.env.AEGIS_ORGANIZATION_ID!,
      agent_id: process.env.AEGIS_AGENT_ID!,
      tool_name: "app.payments.transfer",
      payload: { amount_usd: 2500 },
    },
  );
  if (decision.decision !== "allow") throw new Error(decision.reason);
});`}
      />

      <p>
        For no-code workflows see <Link href="/aegis/n8n">n8n integration</Link>.
      </p>
    </>
  );
}
