import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attest docs",
};

export default function AttestDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Attest documentation</h1>
      <p className="mt-6 text-ink/90">SDK reference and integration guides will ship here per the website roadmap (Phase 2).</p>
    </div>
  );
}
