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
      <CodeBlock
        language="bash"
        code="pip install salanor-aegis"
      />

      <CodeBlock
        language="python"
        code={`from salanor_aegis import sign_event, canonical_digest
import os, httpx

def check_policy(tool_name: str, payload: dict) -> dict:
    r = httpx.post(
        f"${api}/policy/evaluate",
        headers={"Authorization": f"Bearer {os.environ['AEGIS_INGEST_TOKEN']}"},
        json={
            "organization_id": os.environ["AEGIS_ORG_ID"],
            "agent_id": os.environ["AEGIS_AGENT_ID"],
            "tool_name": tool_name,
            "payload": payload,
        },
    )
    r.raise_for_status()
    return r.json()

# BYOK: sign locally with your private key bytes — never send private key to Salanor
# See Python SDK sign_event() and Console → Agents → Register BYOK key`}
      />

      <p>
        TypeScript agents can use <Link href="/aegis/integrations/langgraph">LangGraph guide</Link>{" "}
        patterns with <code>@salanor/aegis</code>.
      </p>
    </>
  );
}
