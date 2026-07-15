import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aether",
};

const MARKETING =
  process.env.NEXT_PUBLIC_DOCS_MARKETING_URL?.trim() || "https://salanor.com";

export default function AetherDocsPage() {
  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--teal-bright)" }}>
        docs.salanor.com/aether
      </p>
      <h1 style={{ fontSize: "2rem", fontWeight: 600, margin: "0.5rem 0 1rem" }}>Aether documentation</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Preview docs for the intelligence layer (2027). Content will expand as Aether enters design partner
        preview.
      </p>
      <p style={{ marginTop: "2rem" }}>
        <Link href={`${MARKETING}/products/aether`}>← Aether on salanor.com</Link>
      </p>
    </main>
  );
}
