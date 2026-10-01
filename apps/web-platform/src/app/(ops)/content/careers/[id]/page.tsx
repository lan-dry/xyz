import Link from "next/link";
import { notFound } from "next/navigation";

import { CareerEditForm } from "@/components/content/career-edit-form";
import { ContentPageShell } from "@/components/content/content-page-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getPrisma } from "@/lib/prisma";

export default async function OpsContentCareerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const { id } = await params;
  const prisma = getPrisma();
  const role = prisma ? await prisma.openRole.findUnique({ where: { id } }) : null;
  if (!role) notFound();

  const marketing = process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://www.salanor.com";

  return (
    <ContentPageShell
      title="Edit role"
      subtitle={role.slug}
      actions={
        <>
          <Link href="/content/careers" className={`${ui.btn} ${ui.btnGhost}`}>
            All roles
          </Link>
          {role.status === "open" ? (
            <a
              href={`${marketing}/careers/${role.slug}`}
              className={`${ui.btn} ${ui.btnGhost}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live
            </a>
          ) : null}
        </>
      }
    >
      {canWrite ? (
        <CareerEditForm
          roleId={role.id}
          defaults={{
            title: role.title,
            slug: role.slug,
            team: role.team,
            location: role.location,
            seniority: role.seniority,
            employmentType: role.employmentType,
            compensationRange: role.compensationRange,
            status: role.status,
            postedAt: role.postedAt,
            closesAt: role.closesAt,
            summary: role.summary,
            requirements: role.requirements,
          }}
        />
      ) : (
        <pre className={`${ui.card} ${ui.cardPad}`} style={{ whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>
          {role.summary}
          {"\n\n---\n\n"}
          {role.requirements}
        </pre>
      )}
    </ContentPageShell>
  );
}
