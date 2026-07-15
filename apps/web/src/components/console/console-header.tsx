import Link from "next/link";

import { signOut } from "@/auth";
import { CONSOLE_AEGIS_BASE, consoleAegisPath } from "@/lib/app-paths";

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
        <Link href={CONSOLE_AEGIS_BASE} className="text-xl font-semibold text-ink">
          Aegis Console
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href={consoleAegisPath("/events")} className="text-ink/80 hover:text-ink">
            Events
          </Link>
          <Link href={consoleAegisPath("/members")} className="text-ink/80 hover:text-ink">
            Members
          </Link>
          <Link href={consoleAegisPath("/api-keys")} className="text-ink/80 hover:text-ink">
            API keys
          </Link>
          <Link href={consoleAegisPath("/billing")} className="text-ink/80 hover:text-ink">
            Billing
          </Link>
          <Link href={consoleAegisPath("/audit")} className="text-ink/80 hover:text-ink">
            Audit log
          </Link>
          <Link href={consoleAegisPath("/policy")} className="text-ink/80 hover:text-ink">
            Policy
          </Link>
          <Link href={consoleAegisPath("/policy/log")} className="text-ink/80 hover:text-ink">
            Policy log
          </Link>
          <Link href={consoleAegisPath("/settings")} className="text-ink/80 hover:text-ink">
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
