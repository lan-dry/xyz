import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Standards · APS-1",
  description: "APS-1 (Agent Provenance Standard) draft 0.1 - required fields and schema reference.",
};

const REQUIRED_FIELDS = ["aps_version", "event_id", "recorded_at", "actor", "action", "subject", "context", "signature", "chain"] as const;

const SCHEMA_EXCERPT = `{
  "aps_version": "0.1",
  "event_id": "<uuid>",
  "recorded_at": "<ISO-8601>",
  "actor": { "id": "...", "type": "..." },
  "action": "decision.record",
  "subject": { "type": "...", "id": "..." },
  "context": { "inputs": {}, "outcome": {} },
  "signature": { "alg": "local-placeholder", "value": "placeholder:..." },
  "chain": { "prev_event_hash": null, "event_hash": "sha256:..." }
}`;

export default function StandardsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">APS-1 · Agent Provenance Standard</h1>
      <p className="mt-4 leading-relaxed text-ink/90">
        <strong>Version:</strong> draft <code className="text-sm">0.1</code> (APS-1). Salanor Aegis records and
        replays events that conform to this JSON Schema on the wire and at rest.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Required fields</h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-ink/90">
          {REQUIRED_FIELDS.map((field) => (
            <li key={field}>
              <code className="text-sm">{field}</code>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/70">
          Optional in v0.1: <code>tenant_id</code>. <code>context</code> requires <code>inputs</code> and{" "}
          <code>outcome</code>; <code>model</code>, <code>policy</code>, and <code>evidence</code> are optional
          extensions.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Canonical schema</h2>
        <p className="mt-4 text-ink/90">
          Full JSON Schema (draft 2020-12):{" "}
          <Link href="https://github.com/salanor/salanor/blob/main/spec/aps/v0.1.json" className="text-teal underline underline-offset-2">
            spec/aps/v0.1.json
          </Link>{" "}
          in the Salanor monorepo. SDK validation uses the same file via <code className="text-sm">@salanor/aegis-ledger-sdk</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-ink/10 bg-bone/50 p-4 text-sm text-ink/90">{SCHEMA_EXCERPT}</pre>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Cloud ingest (P2 prototype)</h2>
        <p className="mt-4 leading-relaxed text-ink/90">
          Validated events can be posted to <code className="text-sm">POST /api/aegis/ingest</code> with API key
          auth. See <code className="text-sm">docs/AEGIS_PHASE_2.md</code> and{" "}
          <code className="text-sm">docs/AEGIS_P2_DURABILITY.md</code> for durability notes. Message bus and anchoring
          are planned for later phases.
        </p>
      </section>
    </div>
  );
}
