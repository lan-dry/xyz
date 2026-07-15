import Link from "next/link";

import { signOut } from "@/auth";
import {
  ConsoleDataTable,
  ConsoleTableHead,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from "@/components/console/console-data-table";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { TotpSettingsCard } from "@/components/console/totp-settings-card";
import { consoleAegisPath } from "@/lib/app-paths";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export default async function ConsoleSettingsPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const identity = await prisma.identityLink.findUnique({
    where: { id: ctx.identityLinkId },
    select: {
      id: true,
      primaryEmail: true,
      memberships: {
        select: {
          id: true,
          role: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { totpEnabledAt: true },
  });

  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="Settings"
        subtitle="Review your console identity, memberships, and authentication status."
      />

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Profile</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-ink/60">Signed-in email</dt>
            <dd className="font-medium text-ink">{ctx.email}</dd>
          </div>
          <div>
            <dt className="text-ink/60">Identity link</dt>
            <dd className="font-mono text-xs text-ink">{ctx.identityLinkId}</dd>
          </div>
          <div>
            <dt className="text-ink/60">Primary identity email</dt>
            <dd className="text-ink">{identity?.primaryEmail ?? ctx.email}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Organization memberships</h3>
        <div className="mt-3">
          <ConsoleDataTable>
            <ConsoleTableHead>
              <tr>
                <ConsoleTh>Organization</ConsoleTh>
                <ConsoleTh>Slug</ConsoleTh>
                <ConsoleTh>Role</ConsoleTh>
              </tr>
            </ConsoleTableHead>
            <tbody>
              {(identity?.memberships ?? []).map((membership) => (
                <ConsoleTableRow key={membership.id}>
                  <ConsoleTd>{membership.organization.name}</ConsoleTd>
                  <ConsoleTd className="font-mono text-xs">{membership.organization.slug}</ConsoleTd>
                  <ConsoleTd>{membership.role}</ConsoleTd>
                </ConsoleTableRow>
              ))}
            </tbody>
          </ConsoleDataTable>
        </div>
      </div>

      <TotpSettingsCard
        enabled={Boolean(user?.totpEnabledAt)}
        enabledAtIso={user?.totpEnabledAt ? user.totpEnabledAt.toISOString() : null}
      />

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Organization billing</h3>
        <p className="mt-2 text-sm text-ink/80">Manage plan and payment state for your active organization.</p>
        <Link
          className="mt-3 inline-flex rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
          href={consoleAegisPath("/billing")}
        >
          Open billing
        </Link>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Session</h3>
        <p className="mt-2 text-sm text-ink/80">Sign out on shared machines and rotate API keys if account access changes.</p>
        <form
          className="mt-3"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-black/[0.03]"
          >
            Sign out
          </button>
        </form>
      </div>
    </section>
  );
}
