import type { Metadata } from "next";

import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = { title: "Authentication" };

export default function ApiAuthPage() {
  return (
    <>
      <h1>Authentication</h1>
      <p className="lead">
        Ingest and policy routes authenticate with an <strong>organization ingest API key</strong>{" "}
        created in the console (API keys page). Keys are scoped to one organization.
      </p>

      <h2>Header format</h2>
      <CodeBlock
        code={`Authorization: Bearer aegis_xxxxxxxxxxxxxxxx`}
      />

      <h2>Key properties</h2>
      <ul>
        <li>Prefix <code>aegis_</code> — treat as a secret; store in a vault or env var.</li>
        <li>Bound to the organization that created it — events must use the same <code>organization_id</code>.</li>
        <li>Revocable from Console → API keys without rotating signing keys.</li>
        <li>Plan limits apply (max keys, events/month) — see Errors & limits.</li>
      </ul>

      <h2>Signing keys (separate from API key)</h2>
      <p>
        Each agent has an Ed25519 <strong>signing key pair</strong>. The private key signs events
        client-side; the public key is registered server-side. Ingest rejects events with unknown{" "}
        <code>key_id</code> or invalid signatures.
      </p>

      <h2>Failure responses</h2>
      <ul>
        <li>
          <code>401</code> — missing/invalid bearer token
        </li>
        <li>
          <code>403</code> — organization mismatch between API key and request body
        </li>
        <li>
          <code>422</code> — unknown signing key or invalid signature
        </li>
      </ul>
    </>
  );
}
