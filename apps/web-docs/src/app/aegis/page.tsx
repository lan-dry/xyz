import type { Metadata } from "next";
import Link from "next/link";

import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Overview" };

export default function AegisOverviewPage() {
  return (
    <>
      <h1>Aegis integration guide</h1>
      <p className="lead">
        Documentation for <strong>your developers</strong> embedding Salanor in production apps —
        signed AI activity, policy on tool calls, and human approvals.
      </p>

      <div className="callout">
        <strong>SDKs:</strong> TypeScript (<code>{DOCS.npmPackage}</code>) is full-featured for
        pilots. Python and Go clients support <strong>sign + ingest</strong> — see{" "}
        <Link href="/aegis/sdk">SDK overview</Link>.
      </div>

      <h2>Typical integration flow</h2>
      <ol>
        <li>Org admin creates ingest API key + agent signing key in the console.</li>
        <li>Your service installs <code>@salanor/aegis</code> and stores secrets in your env.</li>
        <li>Each agent workflow uses a <code>trace_id</code>; LLM steps call <code>signAndIngest</code>.</li>
        <li>Outbound tools (Stripe, CRM, etc.) use <code>wrapFetch</code> for policy + audit.</li>
        <li>Operators review traces and exports in the console — not in your repo.</li>
      </ol>

      <h2>Quick links</h2>
      <ul>
        <li>
          <Link href="/aegis/getting-started">Getting started</Link> — credentials + first event in
          your app
        </li>
        <li>
          <Link href="/aegis/sdk">SDKs</Link> — TypeScript, Python, Go
        </li>
        <li>
          <Link href="/aegis/sdk/typescript">TypeScript SDK</Link>
        </li>
        <li>
          <Link href="/aegis/api/events">HTTP API — ingest</Link>
        </li>
        <li>
          <Link href="/aegis/events/envelope">Event envelope</Link>
        </li>
      </ul>

      <h2>Production endpoints</h2>
      <ul>
        <li>
          <strong>Ingest API:</strong>{" "}
          <code>
            {DOCS.apiBaseUrl}
            {DOCS.apiIngestPath}
          </code>
        </li>
        <li>
          <strong>Public verify:</strong>{" "}
          <code>
            {DOCS.apiBaseUrl}
            {DOCS.apiPublicPath}
          </code>
        </li>
        <li>
          <strong>Console:</strong> <a href={DOCS.consoleUrl}>{DOCS.consoleUrl}</a>
        </li>
      </ul>
    </>
  );
}
