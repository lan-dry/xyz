import Link from "next/link";
import { notFound } from "next/navigation";

import { NewsletterCampaignActions } from "@/components/content/newsletter-campaign-actions";
import { NewsletterCampaignEditForm } from "@/components/content/newsletter-campaign-edit-form";
import { ContentPageShell } from "@/components/content/content-page-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { requirePlatformSession } from "@/lib/platform-server-session";
import { getPrisma } from "@/lib/prisma";

type CampRow = {
  id: string;
  subject: string;
  preview_text: string | null;
  body_markdown: string | null;
  body_html: string;
  body_text: string;
  status: string;
  scheduled_at: Date | null;
  created_by_email: string | null;
  created_at: Date;
  sent_at: Date | null;
  recipient_count: number;
  success_count: number;
  failure_count: number;
};

type DeliveryRow = {
  email: string;
  status: string;
  sent_at: Date;
  error_message: string | null;
};

export default async function OpsNewsletterCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const { id } = await params;
  const query = await searchParams;
  const prisma = getPrisma();
  if (!prisma) notFound();

  const camps = await prisma.$queryRaw<CampRow[]>`
    SELECT id, subject, preview_text, body_markdown, body_html, body_text, status, scheduled_at,
           created_by_email, created_at, sent_at, recipient_count, success_count, failure_count
    FROM newsletter_campaigns WHERE id = ${id}::uuid LIMIT 1
  `;
  const campaign = camps[0];
  if (!campaign) notFound();

  let deliveries: DeliveryRow[] = [];
  try {
    deliveries = await prisma.$queryRaw<DeliveryRow[]>`
      SELECT s.email, d.status, d.sent_at, d.error_message
      FROM newsletter_campaign_deliveries d
      JOIN newsletter_subscribers s ON s.id = d.subscriber_id
      WHERE d.campaign_id = ${id}::uuid
      ORDER BY d.sent_at DESC
    `;
  } catch {
    deliveries = [];
  }

  return (
    <ContentPageShell
      title="Campaign"
      subtitle={campaign.subject}
      actions={
        <Link href="/content/newsletter" className={`${ui.btn} ${ui.btnGhost}`}>
          All campaigns
        </Link>
      }
    >
      {query.saved === "1" ? (
        <p className={ui.badgeMuted} style={{ marginBottom: "1rem" }}>
          Campaign saved.
        </p>
      ) : null}

      <NewsletterCampaignEditForm
        campaignId={campaign.id}
        defaults={{
          subject: campaign.subject,
          previewText: campaign.preview_text,
          bodyMarkdown: campaign.body_markdown,
          scheduledAt: campaign.scheduled_at,
          status: campaign.status,
        }}
      />

      <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem", fontSize: "0.8125rem", margin: 0 }}>
          <dt style={{ color: "var(--console-fg-muted)" }}>Status</dt>
          <dd style={{ margin: 0 }}>{campaign.status}</dd>
          <dt style={{ color: "var(--console-fg-muted)" }}>Created</dt>
          <dd style={{ margin: 0 }}>{campaign.created_at.toISOString().slice(0, 16)} by {campaign.created_by_email ?? "—"}</dd>
          {campaign.scheduled_at && campaign.status === "scheduled" ? (
            <>
              <dt style={{ color: "var(--console-fg-muted)" }}>Scheduled</dt>
              <dd style={{ margin: 0 }}>{campaign.scheduled_at.toISOString().slice(0, 16)} UTC</dd>
            </>
          ) : null}
          {campaign.sent_at ? (
            <>
              <dt style={{ color: "var(--console-fg-muted)" }}>Sent</dt>
              <dd style={{ margin: 0 }}>
                {campaign.sent_at.toISOString().slice(0, 16)} · {campaign.success_count}/{campaign.recipient_count} delivered
                {campaign.failure_count > 0 ? ` · ${campaign.failure_count} failed` : ""}
              </dd>
            </>
          ) : null}
          {campaign.preview_text ? (
            <>
              <dt style={{ color: "var(--console-fg-muted)" }}>Preview</dt>
              <dd style={{ margin: 0 }}>{campaign.preview_text}</dd>
            </>
          ) : null}
        </dl>
        <div style={{ marginTop: "1rem" }}>
          <NewsletterCampaignActions campaignId={campaign.id} status={campaign.status} />
        </div>
      </div>

      {campaign.body_markdown ? (
        <>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Source (Markdown)</h3>
          <pre
            className={`${ui.card} ${ui.cardPad}`}
            style={{
              marginBottom: "1.25rem",
              whiteSpace: "pre-wrap",
              fontSize: "0.8125rem",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {campaign.body_markdown}
          </pre>
        </>
      ) : null}

      <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Rendered email</h3>
      <div
        className={`${ui.card} ${ui.cardPad}`}
        style={{ marginBottom: "1.25rem", fontSize: "0.9375rem", lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: campaign.body_html }}
      />

      <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Recipients</h3>
      {deliveries.length === 0 ? (
        <p className={ui.badgeMuted}>No delivery log yet — send or test the campaign.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={`${d.email}-${d.sent_at.toISOString()}`}>
                  <td>{d.email}</td>
                  <td>{d.status}</td>
                  <td>{d.sent_at.toISOString().slice(0, 16)}</td>
                  <td style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>{d.error_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContentPageShell>
  );
}
