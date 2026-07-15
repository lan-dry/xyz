import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Python SDK" };

export default function SdkPythonPage() {
  return (
    <>
      <h1>Python SDK</h1>
      <p className="lead">
        Package <code>salanor-aegis</code> — APS-1 sign, ingest, trace/span record helpers, and
        policy enforcement for Python agents. Matches{" "}
        <Link href="/aegis/sdk/typescript">TypeScript</Link> canonical signing (conformance vectors).
      </p>

      <div className="callout">
        <strong>HTTP proxy:</strong> TypeScript <code>wrapFetch</code> is not ported. Use{" "}
        <code>enforce_tool_policy</code> before sensitive outbound calls, or{" "}
        <Link href="/aegis/api/policy">POST /v1/aegis/policy/evaluate</Link> directly.
      </div>

      <h2>Installation</h2>
      <CodeBlock
        lang="bash"
        title="Your project"
        code={`pip install salanor-aegis
# or from Salanor source:
# pip install /path/to/salanor/sdks/python`}
      />

      <h2>Record helpers</h2>
      <CodeBlock
        lang="python"
        title="trace + policy deny"
        code={`import os
from salanor_aegis import (
    IngestOptions, PolicyDeniedError, RecordContext, RecordOptions,
    SignOptions, enforce_tool_policy, new_trace_id, record_trace_start,
)

sign = SignOptions(
    private_key_b64=os.environ["SIGNING_PRIVATE_KEY_B64"],
    key_id=os.environ["KEY_ID"],
)
ingest = IngestOptions(
    api_base_url=os.environ.get("AEGIS_API_URL", "${DOCS.apiBaseUrl}"),
    ingest_api_key=os.environ["AEGIS_INGEST_API_KEY"],
)
opts = RecordOptions(sign=sign, ingest=ingest)
ctx = RecordContext(
    organization_id=os.environ["ORGANIZATION_ID"],
    agent_id=os.environ["AGENT_ID"],
    key_id=os.environ["KEY_ID"],
    trace_id=new_trace_id(),
    actor_principal="support-bot",
)

record_trace_start(ctx, trigger_source="webhook", options=opts)
try:
    enforce_tool_policy(ctx, "stripe.paymentIntents.create", opts)
except PolicyDeniedError:
    pass  # policy_decision event ingested; tool not run`}
      />

      <h2>Exports</h2>
      <ul>
        <li>
          <code>sign_and_ingest</code>, <code>sign_event</code>, <code>verify_event_signature</code>
        </li>
        <li>
          <code>record_trace_start</code>, <code>record_llm_invocation</code>,{" "}
          <code>record_data_access</code>, <code>record_decision</code>,{" "}
          <code>record_provenance_claim</code>
        </li>
        <li>
          <code>start_span</code>, <code>end_span</code>, <code>new_trace_id</code>,{" "}
          <code>new_span_id</code>
        </li>
        <li>
          <code>enforce_tool_policy</code>, <code>evaluate_policy_via_api</code>,{" "}
          <code>PolicyDeniedError</code>
        </li>
        <li>
          <code>enrich_provenance_payload</code>, <code>digest_hex</code>
        </li>
      </ul>

      <h2>See also</h2>
      <ul>
        <li>
          <Link href="/aegis/sdk">All SDKs</Link>
        </li>
        <li>
          <Link href="/aegis/api/events">HTTP ingest</Link>
        </li>
        <li>
          Monorepo: <code>sdks/python/README.md</code>
        </li>
      </ul>
    </>
  );
}

