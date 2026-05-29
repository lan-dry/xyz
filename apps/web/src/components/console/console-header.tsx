import Link from "next/link";

import { signOut } from "@/auth";
import { CONSOLE_ATTEST_BASE, consoleAttestPath } from "@/lib/app-paths";

import { OrgSwitcher } from "./org-switcher";

type OrgOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export function ConsoleHeader({
  email,
  organizations,
  activeOrgId,
}: {
  email: string;
  organizations: OrgOption[];
  activeOrgId: string;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-black/10 pb-4">
      <div className="flex flex-wrap items-center gap-6">
        <Link href={CONSOLE_ATTEST_BASE} className="text-xl font-semibold text-ink">
          Attest Console
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href={consoleAttestPath("/events")} className="text-ink/80 hover:text-ink">
            Events
          </Link>
          <Link href={consoleAttestPath("/members")} className="text-ink/80 hover:text-ink">
            Members
          </Link>
          <Link href={consoleAttestPath("/api-keys")} className="text-ink/80 hover:text-ink">
            API keys
          </Link>
          <Link href={consoleAttestPath("/billing")} className="text-ink/80 hover:text-ink">
            Billing
          </Link>
          <Link href={consoleAttestPath("/audit")} className="text-ink/80 hover:text-ink">
            Audit log
          </Link>
          <Link href={consoleAttestPath("/policy")} className="text-ink/80 hover:text-ink">
            Policy
          </Link>
          <Link href={consoleAttestPath("/policy/log")} className="text-ink/80 hover:text-ink">
            Policy log
          </Link>
          <Link href={consoleAttestPath("/settings")} className="text-ink/80 hover:text-ink">
            Settings
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
        <span className="text-ink/70">{email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-ink/80 underline hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
