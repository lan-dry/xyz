import type { Metadata } from "next";

import { ResponseTable } from "@/components/api-reference";

export const metadata: Metadata = { title: "Errors & limits" };

export default function ErrorsPage() {
  return (
    <>
      <h1>Errors & plan limits</h1>
      <p className="lead">
        Ingest API errors return JSON <code>{`{ error: string, code?: string }`}</code>. Use{" "}
        <code>code</code> for programmatic handling where present.
      </p>

      <h2>HTTP status codes</h2>
      <ResponseTable
        rows={[
          { status: "401", body: "Missing or invalid Authorization bearer token" },
          { status: "403", body: "Organization mismatch; org suspended; forbidden scope" },
          { status: "402 / 429", body: "Plan limit — events/month or feature cap (code: plan_limit)" },
          { status: "404", body: "Resource not found (approvals, events)" },
          { status: "409", body: "Conflict — e.g. approval not in approved state" },
          { status: "422", body: "Validation — invalid JSON, signature, envelope fields" },
          { status: "503", body: "Dependency unavailable (database, policy engine)" },
        ]}
      />

      <h2>SDK errors</h2>
      <ul>
        <li>
          <code>PolicyDeniedError</code> — wrapFetch policy returned deny; no HTTP call made
        </li>
        <li>
          <code>ApprovalRequiredError</code> — includes <code>approvalId</code> for obligation flow
        </li>
        <li>
          Network errors include hint to start <code>pnpm dev</code> when API unreachable
        </li>
      </ul>

      <h2>Free plan defaults (typical)</h2>
      <ul>
        <li>5,000 events / month</li>
        <li>3 ingest API keys</li>
        <li>5 members</li>
        <li>90-day retention</li>
      </ul>
      <p>Exact limits are shown in Console → Settings → Plan & usage.</p>

      <h2>Idempotency</h2>
      <p>
        Re-posting the same event with the same <code>Idempotency-Key</code> returns{" "}
        <code>200</code> with <code>status: "replayed"</code> — safe for retries after network
        failures.
      </p>
    </>
  );
}
