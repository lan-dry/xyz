import type { Metadata } from "next";

export const metadata: Metadata = { title: "HTTP API" };

export default function ApiOverviewPage() {
  return (
    <>
      <h1>HTTP API overview</h1>
      <p className="lead">
        Agent integrations use the <strong>ingest API</strong> under <code>/v1/aegis</code> with a
        bearer ingest key. The console UI uses <code>/v1/console</code> with a session cookie — that
        surface is for operators, not embedded in customer agents.
      </p>

      <h2>Ingest API (agents)</h2>
      <ul>
        <li>
          <a href="/aegis/api/authentication">Authentication</a>
        </li>
        <li>
          <a href="/aegis/api/events">POST /events</a> — ingest signed APS events
        </li>
        <li>
          <a href="/aegis/api/policy">POST /policy/evaluate</a> — evaluate tool policy
        </li>
        <li>
          <a href="/aegis/api/approvals">Approvals</a> — obligation workflow
        </li>
      </ul>

      <h2>Public API (no auth)</h2>
      <ul>
        <li>
          <a href="/aegis/api/public">Public verify & transparency</a>
        </li>
      </ul>

      <h2>Headers (all ingest routes)</h2>
      <ul>
        <li>
          <code>Authorization: Bearer &lt;ingest_api_key&gt;</code> — required
        </li>
        <li>
          <code>Content-Type: application/json</code>
        </li>
        <li>
          <code>Salanor-Version: 2026-05-18</code> — recommended (SDK sends automatically)
        </li>
        <li>
          <code>Idempotency-Key</code> — optional on POST /events
        </li>
      </ul>

      <h2>Identity API</h2>
      <p>
        User login, org membership, and invitations live on Salanor ID (
        <code>/v1/id</code>, port 8091). That API powers the console — not agent ingest. Documented
        separately when external IdP integrations ship.
      </p>
    </>
  );
}
