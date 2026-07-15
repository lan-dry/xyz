import Link from "next/link";

import { ConsolePageHeader } from "@/components/console/console-page-header";
import { PolicyEditorPanel } from "@/components/console/policy-editor-panel";
import { roleMeetsMinimum } from "@/lib/console/roles";
import { consoleAegisPath } from "@/lib/app-paths";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export default async function ConsolePolicyPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const [activePolicy, recentPolicies] = await Promise.all([
    prisma.aegisPolicy.findFirst({
      where: {
        organizationId: ctx.activeOrgId,
        enabled: true,
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        version: true,
        enabled: true,
        createdAt: true,
        rules: true,
      },
    }),
    prisma.aegisPolicy.findMany({
      where: {
        organizationId: ctx.activeOrgId,
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        name: true,
        version: true,
        enabled: true,
        createdAt: true,
        rules: true,
      },
    }),
  ]);

  const canManagePolicy = roleMeetsMinimum(ctx.membership.role, "admin");

  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="Policy"
        subtitle="Configure ingest policy rules. Admins and owners can validate and publish policy versions."
        actions={
          <Link
            href={consoleAegisPath("/policy/log")}
            className="inline-flex rounded-lg border border-black/15 px-3 py-2 text-sm font-medium text-ink no-underline transition-colors duration-150 hover:bg-black/[0.03]"
          >
            View policy evaluation log
          </Link>
        }
      />
      <PolicyEditorPanel
        key={ctx.activeOrgId}
        canManagePolicy={canManagePolicy}
        activePolicy={
          activePolicy
            ? {
                ...activePolicy,
                createdAt: activePolicy.createdAt.toISOString(),
              }
            : null
        }
        recentPolicies={recentPolicies.map((policy) => ({
          ...policy,
          createdAt: policy.createdAt.toISOString(),
        }))}
      />
    </section>
  );
}
