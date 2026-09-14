import Link from "next/link";

import { ConsolePageHeader } from "@/components/console/console-page-header";
import { consoleInkCtaClass } from "@/components/console/console-cta";

export default function ConsoleHelpPage() {
  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="Help"
        subtitle="Product docs, standards, and a direct line to the team when you are stuck."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--console-fg)]">Documentation</h2>
          <p className="mt-1 text-sm text-[var(--console-fg-subtle)]">
            Integration guides, APS schema, and console workflows live in the public docs.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/docs/aegis"
              className={`inline-flex rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ${consoleInkCtaClass}`}
            >
              Aegis docs
            </Link>
            <Link
              href="/standards"
              className="inline-flex rounded-lg border border-[var(--console-border)] px-3 py-2 text-sm font-medium text-[var(--console-fg)] no-underline transition-colors duration-150 hover:bg-[var(--console-surface-hover)]"
            >
              Standards
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--console-fg)]">Contact support</h2>
          <p className="mt-1 text-sm text-[var(--console-fg-subtle)]">
            Email the founders with your org slug, what you tried, and any event or trace IDs.
          </p>
          <a
            href="mailto:founders@salanor.com?subject=Aegis%20Console%20Support"
            className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ${consoleInkCtaClass}`}
          >
            founders@salanor.com
          </a>
        </article>
      </div>
    </section>
  );
}
