import Link from "next/link";
import { Briefcase } from "lucide-react";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { cmsSetupHint, getCmsDbStatus } from "@/lib/cms-db";
import { getPrisma } from "@/lib/prisma";

export default async function OpsContentCareersPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const db = await getCmsDbStatus();
  const prisma = getPrisma();
  const roles =
    db.careers && prisma
      ? await prisma.openRole.findMany({
          orderBy: { postedAt: "desc" },
          take: 200,
        })
      : [];

  return (
    <ContentPageShell
      title="Careers"
      subtitle="Role pages are Markdown (overview + requirements, images via /blog/media). Status open → www/careers."
      actions={
        db.careers && canWrite ? (
          <Link href="/content/careers/new" className={`${ui.btn} ${ui.btnPrimary}`}>
            New role
          </Link>
        ) : db.careers && !canWrite ? (
          <span className={ui.badgeMuted}>Read-only</span>
        ) : null
      }
    >
      {!db.careers ? (
        <EmptyStatePanel title="Careers CMS needs database setup" description={cmsSetupHint()} />
      ) : null}

      {db.careers && roles.length === 0 ? (
        <EmptyStatePanel
          icon={Briefcase}
          title="No open roles"
          description={canWrite ? "Create your first role with New role." : "No roles in the database yet."}
        />
      ) : db.careers ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Posted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td style={{ fontWeight: 500 }}>{role.title}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{role.slug}</td>
                  <td>{role.status}</td>
                  <td>{role.postedAt.toISOString().slice(0, 10)}</td>
                  <td>
                    <Link href={`/content/careers/${role.id}`} className={ui.tableLink}>
                      {canWrite ? "Edit" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ContentPageShell>
  );
}
