import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aether",
};

export default function AetherPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">The research program behind the trust layer.</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        Aether is Salanor's public research program. We work on the technical and standards questions that must be
        answered before autonomous systems can be deployed where being wrong has consequences.
      </p>
      <h2 className="mt-12 text-xl font-semibold text-ink">Tracks</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-ink/90">
        <li>
          <strong>Provenance</strong> - cryptographic and architectural foundations for verifiable agent behavior.
        </li>
        <li>
          <strong>Replayability</strong> - determinism, model versioning, reconstruction.
        </li>
        <li>
          <strong>Standards</strong> - APS-1 - the Agent Provenance Standard.
        </li>
        <li>
          <strong>Policy</strong> - how accountability frameworks map to engineering primitives.
        </li>
      </ul>
    </div>
  );
}
