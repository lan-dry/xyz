import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Run stack locally",
};

export default function InternalLocalDevPage() {
  return (
    <>
      <h1>Run the Salanor stack locally</h1>
      <p className="lead">
        <strong>Salanor engineering only.</strong> Customers integrating Aegis do not follow this
        page — they use <Link href="/aegis/getting-started">Getting started</Link> in their own apps.
      </p>

      <div className="callout">
        This is how you develop the platform (console, API, ID service) on your machine. It is not
        part of customer onboarding.
      </div>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node 22+, pnpm, Docker</li>
        <li>Clone <code>salanor</code> monorepo</li>
      </ul>

      <h2>Start services</h2>
      <CodeBlock
        lang="bash"
        title="From monorepo root"
        code={`cd salanor
docker compose up -d
pnpm db:migrate
pnpm dev`}
      />
      <p>Typical local URLs:</p>
      <ul>
        <li>Console — <code>http://localhost:3000</code></li>
        <li>Docs — <code>http://localhost:3002</code></li>
        <li>Aegis API — <code>http://localhost:8080</code></li>
        <li>Salanor ID — <code>http://localhost:8091</code></li>
        <li>Platform Ops — <code>http://localhost:3003</code></li>
      </ul>

      <h2>More</h2>
      <p>
        See monorepo <code>docs/DEV.md</code>, <code>docs/PILOT_WALKTHROUGH.md</code>, and{" "}
        <code>pnpm pilot:agent</code> for pilot demos.
      </p>
    </>
  );
}
