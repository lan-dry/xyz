import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "CrewAI integration" };

export default function CrewAiPage() {
  const api = DOCS.apiBaseUrl;

  return (
    <>
      <h1>CrewAI integration</h1>
      <p className="lead">
        Record CrewAI tool steps as signed APS-1 events and evaluate policy before side-effectful
        tools run.
      </p>

      <h2>Python SDK</h2>
      <CodeBlock lang="bash" code="pip install salanor-aegis-ledger" />

      <CodeBlock
        lang="python"
        code={`import os
from salanor_aegis_ledger.crewai import governed_tool
from crewai.tools import tool

@governed_tool(
    api_base_url="${api}",
    ingest_token=os.environ["AEGIS_INGEST_TOKEN"],
    organization_id=os.environ["AEGIS_ORG_ID"],
    agent_id=os.environ["AEGIS_AGENT_ID"],
    key_id=os.environ["AEGIS_KEY_ID"],
    private_key_b64=os.environ["AEGIS_SIGNING_PRIVATE_KEY_B64"],
    tool_name="app.payments.transfer",
)
@tool("Transfer funds")
def transfer_funds(amount_usd: float) -> str:
    return "Transferred $" + format(amount_usd, ",.2f")`}
      />

      <p>
        BYOK: register your public key in Console → Agents → Register BYOK key. Private key
        stays in your runtime only.
      </p>

      <p>
        TypeScript agents can use <Link href="/aegis/integrations/langgraph">LangGraph guide</Link>{" "}
        patterns with <code>@salanor/aegis</code>.
      </p>
    </>
  );
}
