import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "For engineers",
  description:
    "Plain-language explanations of APS-1, agent DIDs, OPA/WASM, Merkle witnesses, hash chains, and customer-held keys in Aegis.",
  alternates: { canonical: "/for-engineers" },
};

export default function ForEngineersPage() {
  return (
    <MarketingPage
      label="For engineers"
      title="Terms used under the hood"
      lead="Jargon stays off the homepage. Each term is explained in plain words on first use here."
      layout="wide"
      backHref="/"
    >
      <>
        <h2>APS-1</h2>
        <p>
          Agent Provenance Standard, version 1. A signed JSON event format for
          what an automated system did: who acted, which tool, which decision,
          and a hash that chains to the previous event.
        </p>

        <h2>did:agent</h2>
        <p>
          A decentralised identifier for an agent identity. In Aegis it names
          which runtime or keyholder signed an event so verifiers can look up the
          matching public key.
        </p>

        <h2>OPA / WASM</h2>
        <p>
          Open Policy Agent can compile Rego policies to WebAssembly. Aegis can
          evaluate those bundles when you bring Rego; the default bank packs use
          structured rules without requiring Rego.
        </p>

        <h2>Merkle witness</h2>
        <p>
          A batch proof that a set of event hashes was included in a published
          root. The default worker cadence is 60 seconds and is configurable. It
          is not a durability guarantee by itself.
        </p>

        <h2>Hash chain</h2>
        <p>
          Each sealed event carries the hash of the previous event for that
          agent sequence. Tampering with one event breaks the chain that follows.
        </p>

        <h2>Customer-held keys (sometimes called BYOK)</h2>
        <p>
          You register public keys with Aegis and sign in your agent runtime or
          KMS. Softened claim: customer-controlled signing where configured.
          Managed cloud KMS Sign is supported when credentials are present;
          unsupported providers stay labelled.
        </p>

        <p style={{ marginTop: "2rem" }}>
          <Link href="/products/aegis">Product overview</Link>
          {" · "}
          <Link href="/legal/security">Security</Link>
        </p>
      </>
    </MarketingPage>
  );
}
