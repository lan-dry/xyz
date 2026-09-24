import Link from "next/link";

import { createRole } from "@/app/(ops)/content/careers/actions";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { cmsSetupHint, getCmsDbStatus } from "@/lib/cms-db";
import { prisma } from "@/lib/prisma";

export default async function OpsContentCareersPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const db = await getCmsDbStatus();
  const roles = db.careers
    ? await prisma.openRole.findMany({
        orderBy: { postedAt: "desc" },
        take: 200,
      })
    : [];

  return (
    <ContentPageShell title="Careers" subtitle="Open roles shown on the careers page when wired to DB."    >
      {!db.careers ? (
        <EmptyStatePanel title="Careers CMS needs database setup" description={cmsSetupHint()} />
      ) : null}
      {db.careers && canWrite ? (
        <form action={createRole} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Create role</h3>
          <div className={forms.formGrid2}>
            <input name="title" placeholder="Title" className={ui.input} required />
            <input name="slug" placeholder="slug" className={ui.input} required />
            <input name="team" placeholder="Team" className={ui.input} required />
            <input name="location" placeholder="Location" className={ui.input} required />
            <input name="seniority" placeholder="Seniority" className={ui.input} required />
            <select name="employmentType" className={ui.select} defaultValue="full_time">
              <option value="full_time">full_time</option>
              <option value="part_time">part_time</option>
              <option value="contract">contract</option>
            </select>
          </div>
          <textarea name="summary" placeholder="Summary" rows={5} className={ui.textarea} required />
          <textarea name="requirements" placeholder="Requirements" rows={5} className={ui.textarea} required />
          <div className={forms.formGrid3}>
            <input name="compensationRange" placeholder="Compensation" className={ui.input} />
            <select name="status" className={ui.select} defaultValue="open">
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="draft">draft</option>
            </select>
            <input name="postedAt" type="datetime-local" className={ui.input} />
          </div>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Create
          </button>
        </form>
      ) : (
        <p className={ui.badgeMuted} style={{ marginBottom: "1rem" }}>
          Read-only
        </p>
      )}

      {db.careers && roles.length === 0 ? (
        <EmptyStatePanel title="No open roles" description="Create your first role using the form above." />
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
