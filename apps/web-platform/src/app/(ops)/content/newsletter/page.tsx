import Link from "next/link";
import { Download, Mail, Users } from "lucide-react";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { NewsletterCampaignActions } from "@/components/content/newsletter-campaign-actions";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getPrisma } from "@/lib/prisma";

export default async function OpsContentNewsletterPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const prisma = getPrisma();

  type SubRow = {
    email: string;
    created_at: Date;
    confirmed_at: Date | null;
    unsubscribed_at: Date | null;
    source: string;
  };

  type CampRow = {
    id: string;
    subject: string;
    status: string;
    scheduled_at: Date | null;
    created_at: Date;
    sent_at: Date | null;
    recipient_count: number;
    success_count: number;
    failure_count: number;
  };

  let subs: SubRow[] = [];
  let campaigns: CampRow[] = [];
  let tableReady = false;

  if (prisma) {
    try {
      subs = await prisma.$queryRaw<SubRow[]>`
        SELECT email, created_at, confirmed_at, unsubscribed_at, source
        FROM newsletter_subscribers
        ORDER BY created_at DESC
        LIMIT 500
      `;
      campaigns = await prisma.$queryRaw<CampRow[]>`
        SELECT id, subject, status, scheduled_at, created_at, sent_at, recipient_count, success_count, failure_count
        FROM newsletter_campaigns
        ORDER BY created_at DESC
        LIMIT 50
      `;
      tableReady = true;
    } catch {
      tableReady = false;
    }
  }

  const activeCount = subs.filter((r) => r.confirmed_at && !r.unsubscribed_at).length;

  return (
    <ContentPageShell
      title="Newsletter"
      subtitle={`Double opt-in · ${activeCount} active subscriber${activeCount === 1 ? "" : "s"} · broadcasts via Resend on www`}
      actions={
        tableReady ? (
          <>
            {canWrite ? (
              <Link href="/content/newsletter/new" className={`${ui.btn} ${ui.btnPrimary}`}>
                New campaign
              </Link>
            ) : null}
            <Link href="/content/newsletter/export" className={`${ui.btn} ${ui.btnGhost}`} prefetch={false}>
              <Download size={16} strokeWidth={2} aria-hidden />
              Export subscribers (CSV)
            </Link>
          </>
        ) : null
      }
    >
      {!tableReady ? (
        <EmptyStatePanel
          title="Newsletter tables missing"
          description="Run pnpm db:migrate (001_baseline includes newsletter tables). Set DATABASE_URL on Platform Ops."
        />
      ) : null}

      {tableReady && campaigns.length === 0 && canWrite ? (
        <EmptyStatePanel
          icon={Mail}
          title="No campaigns yet"
          description="Create a draft with New campaign, send a test, then schedule or send."
        />
      ) : null}

      {tableReady && campaigns.length > 0 ? (
        <>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>Campaigns</h3>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Schedule / sent</th>
                  <th>Results</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link href={`/content/newsletter/${c.id}`} className={ui.tableLink}>
                        {c.subject}
                      </Link>
                    </td>
                    <td>{c.status}</td>
                    <td>
                      {c.status === "scheduled" && c.scheduled_at
                        ? c.scheduled_at.toISOString().slice(0, 16)
                        : c.sent_at?.toISOString().slice(0, 16) ?? "—"}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {c.status === "sent" || c.status === "failed"
                        ? `${c.success_count}/${c.recipient_count} ok`
                        : "—"}
                    </td>
                    {canWrite ? (
                      <td>
                        <NewsletterCampaignActions campaignId={c.id} status={c.status} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tableReady ? (
        <>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>Subscribers</h3>
          {subs.length === 0 ? (
            <EmptyStatePanel
              icon={Users}
              title="No subscribers yet"
              description="Footer signup on www after migrate."
            />
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((row) => {
                    let status = "pending confirm";
                    if (row.unsubscribed_at) status = "unsubscribed";
                    else if (row.confirmed_at) status = "active";
                    return (
                      <tr key={row.email}>
                        <td>{row.email}</td>
                        <td>{status}</td>
                        <td>{row.source}</td>
                        <td>{row.created_at.toISOString().slice(0, 10)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </ContentPageShell>
  );
}
