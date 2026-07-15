import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aegis pricing",
};

export default function AegisPricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink md:text-4xl">Pricing</h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-ink/90">
        Paid tiers are in design. Phase 0 remains self-serve and local-friendly; team plans will publish here when
        Stripe price IDs are finalized.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <article className="rounded-xl border border-black/10 bg-bone p-6">
          <h2 className="text-lg font-semibold text-ink">Developer</h2>
          <p className="mt-2 text-3xl font-semibold text-ink">$0</p>
          <p className="mt-3 text-sm text-ink/80">SDK, local ledger, and console sandbox for evaluation.</p>
        </article>
        <article className="rounded-xl border border-dashed border-black/15 bg-ink/[0.02] p-6">
          <h2 className="text-lg font-semibold text-ink">Team</h2>
          <p className="mt-2 text-3xl font-semibold text-ink">Coming soon</p>
          <p className="mt-3 text-sm text-ink/80">Shared retention, invites, and billing in the console.</p>
        </article>
      </div>
      <p className="mt-10">
        <Link href="/contact" className="font-medium text-teal no-underline hover:underline">
          Talk to us about early access
        </Link>
      </p>
    </div>
  );
}
