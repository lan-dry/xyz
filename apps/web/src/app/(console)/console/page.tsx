import Link from "next/link";

import { consoleInkCtaClass } from "@/components/console/console-cta";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { StatusChip } from "@/components/console/status-chip";
import { consoleAegisPath } from "@/lib/app-paths";
import { resolveConsoleContext } from "@/lib/console/session";

export default async function ConsoleHomePage() {
  const ctx = await resolveConsoleContext();

  return (
    <section className="space-y-6">
      <ConsolePageHeader title="Dashboard" subtitle="Manage organization access, keys, policy, and billing." />

      {ctx ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Current role</span>
          <StatusChip>{ctx.membership.role}</StatusChip>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">Getting started</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Local/demo console access uses the seeded <span className="font-medium text-ink">Dev Organization</span> and
          can auto-provision your first membership when <code className="text-xs">AEGIS_CONSOLE_AUTO_PROVISION=1</code>.
          Self-serve organization creation is the default production path.
        </p>
        <div className="mt-4">
          <Link
            className="inline-flex rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
            href={consoleAegisPath("/orgs/new")}
          >
            Create organization
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-ink">See your first events</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Create an organization from the sidebar switcher.</li>
          <li>Invite teammates and set roles in Members.</li>
          <li>Create an API key in API keys.</li>
          <li>Run <code className="text-xs">pnpm aegis:ingest-demo</code> with that key.</li>
          <li>Open Events and verify rows for your active organization.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            className={`inline-flex rounded-lg px-3 py-2 font-medium no-underline transition-colors duration-150 ${consoleInkCtaClass}`}
            href={consoleAegisPath("/events")}
          >
            Open events
          </Link>
          <Link
            className="inline-flex rounded-lg border border-black/15 px-3 py-2 font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
            href={consoleAegisPath("/api-keys")}
          >
            Manage API keys
          </Link>
          <Link
            className="inline-flex rounded-lg border border-black/15 px-3 py-2 font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
            href={consoleAegisPath("/audit")}
          >
            View audit log
          </Link>
        </div>
      </div>
    </section>
  );
}
