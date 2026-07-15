import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "TypeScript SDK" };

export default function SdkTypescriptPage() {
  return (
    <>
      <h1>TypeScript / JavaScript SDK</h1>
      <p className="lead">
        Package: <code>{DOCS.npmPackage}</code> (Node 18+, ESM). Full SDK: ingest, policy proxy, and
        approvals. Other languages: <Link href="/aegis/sdk">SDK overview</Link> (Python record +
        policy enforce; Go sign/ingest).
      </p>

      <h2>Installation</h2>
      <CodeBlock lang="bash" code={`pnpm add ${DOCS.npmPackage}`} />

      <h2>Exports</h2>
      <ul>
        <li>
          <code>signAndIngest(event, signOptions, ingestOptions)</code> — sign with Ed25519 and POST
          to ingest
        </li>
        <li>
          <code>wrapFetch(url, init, config)</code> — evaluate policy, ingest decision, then run
          fetch or throw
        </li>
        <li>
          <code>wrapFetchResume(approvalId, url, init, config)</code> — continue after human
          approval
        </li>
        <li>
          <code>verifyEventSignature(event, publicKeyB64)</code> — local signature check
        </li>
        <li>
          <code>buildGovernanceInsights(events)</code> — derive audit narrative from event payloads
        </li>
      </ul>

      <h2>signAndIngest</h2>
      <p>Record LLM invocations, human steps, or custom agent actions.</p>
      <CodeBlock
        lang="typescript"
        code={`import { signAndIngest, type ApsEvent } from "${DOCS.npmPackage}";

const event: ApsEvent = { /* see Event envelope */ };

const result = await signAndIngest(
  event,
  { privateKeyB64: "…", keyId: "key_…" },
  {
    apiBaseUrl: "${DOCS.apiBaseUrl}",
    ingestApiKey: "aegis_…",
    idempotencyKey: "optional-stable-key",
  },
);
// result: { event_id, status: "created"|"replayed", sequence_num?, event_hash? }`}
      />

      <h2>wrapFetch</h2>
      <p>
        Use for outbound tools (payments, CRM writes). Policy is evaluated <em>before</em> the HTTP
        call. A signed <code>policy_decision</code> event is always ingested.
      </p>
      <CodeBlock
        lang="typescript"
        code={`import { wrapFetch, PolicyDeniedError } from "${DOCS.npmPackage}";

try {
  const res = await wrapFetch(
    "https://api.stripe.com/v1/payment_intents",
    { method: "POST", body: "…" },
    {
      context: {
        organizationId: "…",
        agentId: "agt_…",
        keyId: "key_…",
        traceId: "trc_…",
        toolName: "stripe.paymentIntents.create",
        actorPrincipal: "support-agent",
        auditPayload: {
          amount_usd: 249,
          trigger_source: "support_ticket",
          trigger_reason: "Customer refund request",
        },
      },
      sign: { privateKeyB64: "…", keyId: "key_…" },
      ingest: { apiBaseUrl: "${DOCS.apiBaseUrl}", ingestApiKey: "aegis_…" },
    },
  );
} catch (e) {
  if (e instanceof PolicyDeniedError) {
    // Policy blocked — no HTTP call was made
  }
}`}
      />

      <h2>Typical agent flow</h2>
      <ol>
        <li>Generate <code>trace_id</code> per user request or ticket.</li>
        <li>
          Each LLM call → <code>signAndIngest</code> with <code>action_kind: llm_invocation</code>{" "}
          and <code>data_touched</code> in payload.
        </li>
        <li>
          Each external tool → <code>wrapFetch</code> with a stable <code>tool_name</code> matching
          console policy rules.
        </li>
        <li>
          On <code>allow_with_obligation</code>, SDK throws <code>ApprovalRequiredError</code> — poll
          approval API or use console.
        </li>
      </ol>
    </>
  );
}
