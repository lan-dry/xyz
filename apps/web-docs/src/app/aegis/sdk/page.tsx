import type { Metadata } from "next";
import Link from "next/link";

import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "SDKs" };

export default function SdkOverviewPage() {
  return (
    <>
      <h1>SDKs</h1>
      <p className="lead">
        Choose a client for your stack. All languages use the same APS-1 signing rules and the same{" "}
        <Link href="/aegis/api/events">ingest API</Link>.
      </p>

      <div className="callout">
        <strong>Pilot / MVP:</strong> TypeScript is the full-featured SDK (ingest + policy proxy +
        approvals). Python ships <strong>record helpers + policy enforce</strong>; Go ships sign +
        ingest. Rust and Java are on the
        blueprint roadmap — use HTTP until then.
      </div>

      <h2>Language matrix</h2>
      <div className="table-wrap">
        <table className="param-table">
        <thead>
          <tr>
            <th>Language</th>
            <th>Package</th>
            <th>sign + ingest</th>
            <th>Policy proxy (<code>wrapFetch</code>)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <Link href="/aegis/sdk/typescript">TypeScript / JavaScript</Link>
            </td>
            <td>
              <code>{DOCS.npmPackage}</code>
            </td>
            <td>Yes</td>
            <td>Yes</td>
            <td>
              <strong>GA (pilot)</strong>
            </td>
          </tr>
          <tr>
            <td>
              <Link href="/aegis/sdk/python">Python</Link>
            </td>
            <td>
              <code>salanor-aegis</code>
            </td>
            <td>Yes</td>
            <td>
              <code>enforce_tool_policy</code>
            </td>
            <td>
              <strong>Pilot</strong>
            </td>
          </tr>
          <tr>
            <td>
              <Link href="/aegis/sdk/go">Go</Link>
            </td>
            <td>
              <code>github.com/salanor/salanor-go/aegis</code>
            </td>
            <td>Yes</td>
            <td>
              <Link href="/aegis/api/policy">HTTP API</Link>
            </td>
            <td>Beta (sign + verify)</td>
          </tr>
          <tr>
            <td>Rust</td>
            <td>
              <code>salanor-aegis</code> (planned)
            </td>
            <td>—</td>
            <td>—</td>
            <td>Roadmap</td>
          </tr>
          <tr>
            <td>Java</td>
            <td>
              <code>com.salanor:aegis</code> (planned)
            </td>
            <td>—</td>
            <td>—</td>
            <td>Roadmap</td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2>Environment variables (all languages)</h2>
      <ul>
        <li>
          <code>AEGIS_API_URL</code> — API base, e.g. <code>{DOCS.apiBaseUrl}</code>
        </li>
        <li>
          <code>AEGIS_INGEST_API_KEY</code> — from console → API keys
        </li>
        <li>
          <code>ORGANIZATION_ID</code>, <code>AGENT_ID</code>, <code>KEY_ID</code>,{" "}
          <code>SIGNING_PRIVATE_KEY_B64</code> — from console → Agents
        </li>
      </ul>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href="/aegis/getting-started">Getting started</Link>
        </li>
        <li>
          <Link href="/aegis/events/envelope">Event envelope</Link>
        </li>
      </ul>
    </>
  );
}
