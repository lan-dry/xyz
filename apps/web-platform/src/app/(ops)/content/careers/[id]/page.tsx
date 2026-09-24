import Link from "next/link";
import { notFound } from "next/navigation";

import { updateRole } from "@/app/(ops)/content/careers/actions";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { prisma } from "@/lib/prisma";

export default async function OpsContentCareerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const { id } = await params;
  const role = await prisma.openRole.findUnique({ where: { id } });
  if (!role) notFound();

  return (
    <ContentPageShell
      title="Edit role"
      subtitle={role.slug}
      actions={
        <Link href="/content/careers" className={`${ui.btn} ${ui.btnGhost}`}>
          All roles
        </Link>
      }
    >
      {canWrite ? (
        <form action={updateRole.bind(null, role.id)} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
          <div className={forms.formGrid2}>
            <input name="title" defaultValue={role.title} className={ui.input} required />
            <input name="slug" defaultValue={role.slug} className={ui.input} required />
            <input name="team" defaultValue={role.team} className={ui.input} required />
            <input name="location" defaultValue={role.location} className={ui.input} required />
            <input name="seniority" defaultValue={role.seniority} className={ui.input} required />
            <select name="employmentType" defaultValue={role.employmentType} className={ui.select}>
              <option value="full_time">full_time</option>
              <option value="part_time">part_time</option>
              <option value="contract">contract</option>
            </select>
          </div>
          <textarea name="summary" defaultValue={role.summary} rows={6} className={ui.textarea} required />
          <textarea name="requirements" defaultValue={role.requirements} rows={6} className={ui.textarea} required />
          <div className={forms.formGrid3}>
            <input name="compensationRange" defaultValue={role.compensationRange ?? ""} className={ui.input} />
            <select name="status" defaultValue={role.status} className={ui.select}>
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="draft">draft</option>
            </select>
            <input
              name="postedAt"
              type="datetime-local"
              defaultValue={role.postedAt.toISOString().slice(0, 16)}
              className={ui.input}
            />
          </div>
          <input
            name="closesAt"
            type="datetime-local"
            defaultValue={role.closesAt ? role.closesAt.toISOString().slice(0, 16) : ""}
            className={ui.input}
          />
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Save
          </button>
        </form>
      ) : (
        <pre className={`${ui.card} ${ui.cardPad}`} style={{ whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>
          {role.summary}
        </pre>
      )}
    </ContentPageShell>
  );
}
