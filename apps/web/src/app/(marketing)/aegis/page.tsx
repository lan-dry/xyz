import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aegis",
};

export default function AegisPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink md:text-4xl">Every decision your systems make. On the record.</h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-ink/90">
        Aegis is a verifiable decision record for AI agents and automated systems. Drop in the SDK, and every
        consequential decision - what it did, on what evidence, under whose policy - is recorded to a tamper-evident
        ledger your auditors can replay end-to-end.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/contact" className="rounded bg-teal px-4 py-2 text-bone no-underline hover:opacity-90">
          Request access
        </Link>
        <Link href="/aegis/docs" className="rounded border border-ink/20 px-4 py-2 text-ink no-underline hover:bg-ink/5">
          Technical overview
        </Link>
        <Link href="/aegis/pricing" className="rounded border border-ink/20 px-4 py-2 text-ink no-underline hover:bg-ink/5">
          Pricing
        </Link>
      </div>
      <h2 className="mt-16 text-xl font-semibold text-ink">Get started</h2>
      <p className="mt-4 max-w-2xl text-ink/90">
        Install the TypeScript SDK and record a decision in a few lines. Run the full local demo with{" "}
        <code className="rounded bg-ink/5 px-1.5 py-0.5 text-sm">pnpm aegis:demo</code> from the monorepo root.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-black/10 bg-ink/[0.03] p-4 text-sm leading-relaxed text-ink">
        <code>{`import { aegis } from "@salanor/aegis-ledger-sdk";

const { event } = aegis.record(storePath, {
  tenant_id: "your-tenant",
  actor: { id: "agent:rules-engine", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "credit-approval" },
  context: {
    inputs: { amount_usd: 12000 },
    model: { id: "rules-v1", version: "1.0.0" },
    policy: { id: "credit-policy", version: "2026-01" },
    evidence: [],
    outcome: { decision: "approve", confidence: 0.92 },
  },
});`}</code>
      </pre>
      <h2 className="mt-16 text-xl font-semibold text-ink">The four primitives</h2>
      <dl className="mt-6 space-y-4 text-ink/90">
        <div>
          <dt className="font-medium text-ink">Capture</dt>
          <dd className="mt-1">
            A typed SDK call records inputs, model, policy, evidence, and outcome as a structured event.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Anchor</dt>
          <dd className="mt-1">
            Events are hashed and committed to a tamper-evident ledger; periodic public anchors make tampering
            observable.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Replay</dt>
          <dd className="mt-1">
            Reconstruct any historical decision with the same inputs, model version, and policy state where
            determinism allows.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Export</dt>
          <dd className="mt-1">
            Generate signed evidence packs - PDF and JSON - for regulators, auditors, and review boards.
          </dd>
        </div>
      </dl>
      <h2 className="mt-16 text-xl font-semibold text-ink">What we do not do</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-ink/90">
        <li>We do not build models - we record what yours do.</li>
        <li>We do not host your raw data by default - deployment can stay in your environment.</li>
        <li>We do not pretend AI is magic - we treat it like any other consequential system.</li>
      </ul>
      <p className="mt-12">
        <Link href="/contact" className="font-medium text-teal no-underline hover:underline">
          Talk to the Aegis team
        </Link>
      </p>
    </div>
  );
}
