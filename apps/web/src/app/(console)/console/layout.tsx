import { CONSOLE_ACCESS_DENIED_MESSAGE } from "@salanor/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { ConsoleShell } from "@/components/console/console-shell";
import { logConsoleSignIn, resolveConsoleContextWithDiagnostics } from "@/lib/console/session";

export const metadata: Metadata = {
  title: "Aegis Console",
};

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent("/app/console/aegis")}`);
  }

  const resolved = await resolveConsoleContextWithDiagnostics();
  const ctx = resolved.context;

  if (!ctx) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold text-ink">Aegis Console</h1>
        <p className="mt-4 leading-relaxed text-ink/90">{CONSOLE_ACCESS_DENIED_MESSAGE}</p>
        {resolved.autoProvisionEnabled ? (
          resolved.autoProvisionError ? (
            <p className="mt-4 text-sm text-ink/70">
              Auto-provision is enabled but membership bootstrap failed:{" "}
              <code className="text-xs">{resolved.autoProvisionError}</code>. Verify your DB is reachable, run{" "}
              <code className="text-xs">pnpm db:push</code>, then refresh <code className="text-xs">/console</code>.
            </p>
          ) : (
            <p className="mt-4 text-sm text-ink/70">
              Auto-provision is enabled but no membership was created. Confirm{" "}
              <code className="text-xs">AEGIS_DEV_ORGANIZATION_ID</code> is valid and restart{" "}
              <code className="text-xs">pnpm dev</code> after any <code className="text-xs">.env</code> changes.
            </p>
          )
        ) : (
          <p className="mt-4 text-sm text-ink/70">
            For local dev, set <code className="text-xs">AEGIS_CONSOLE_AUTO_PROVISION=1</code> and restart{" "}
            <code className="text-xs">pnpm dev</code>.
          </p>
        )}
      </div>
    );
  }

  await logConsoleSignIn(ctx.identityLinkId, ctx.activeOrgId);

  const orgOptions = ctx.memberships.map((m) => ({
    id: m.organizationId,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
  }));

  return (
    <ConsoleShell
      email={ctx.email}
      organizations={orgOptions}
      activeOrgId={ctx.activeOrgId}
      signOutControl={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100"
          >
            Log out
          </button>
        </form>
      }
    >
      {children}
    </ConsoleShell>
  );
}
