import { getNewsletterPool } from "./pool";
import { sendNewsletterCampaignEmail } from "./email";

type ActiveSubscriber = {
  id: string;
  email: string;
  unsubscribe_token: string;
};

type CampaignRow = {
  id: string;
  subject: string;
  preview_text: string | null;
  body_html: string;
  body_text: string;
  status: string;
};

const BATCH = 8;

export async function sendNewsletterCampaign(campaignId: string): Promise<{
  recipientCount: number;
  successCount: number;
  failureCount: number;
}> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  try {
    const campRes = await pool.query<CampaignRow>(
      `SELECT id, subject, preview_text, body_html, body_text, status
       FROM newsletter_campaigns WHERE id = $1`,
      [campaignId],
    );
    const campaign = campRes.rows[0];
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "sent") throw new Error("Campaign already sent");
    if (campaign.status === "sending") throw new Error("Campaign is already sending");
    if (!["draft", "scheduled", "failed"].includes(campaign.status)) {
      throw new Error(`Campaign cannot be sent from status: ${campaign.status}`);
    }

    await pool.query(
      `UPDATE newsletter_campaigns SET status = 'sending', scheduled_at = NULL, updated_at = now() WHERE id = $1`,
      [campaignId],
    );

    const subs = await pool.query<ActiveSubscriber>(
      `SELECT id, email, unsubscribe_token
       FROM newsletter_subscribers
       WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
       ORDER BY created_at ASC`,
    );

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < subs.rows.length; i += BATCH) {
      const chunk = subs.rows.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (sub) => {
          try {
            const result = await sendNewsletterCampaignEmail({
              to: sub.email,
              subject: campaign.subject,
              previewText: campaign.preview_text,
              bodyHtml: campaign.body_html,
              bodyText: campaign.body_text,
              unsubscribeToken: sub.unsubscribe_token,
            });
            if (!result.sent) {
              failureCount += 1;
              await logDelivery(pool, campaignId, sub.id, "failed", "RESEND not configured", null);
              return;
            }
            successCount += 1;
            await logDelivery(pool, campaignId, sub.id, "sent", null, result.providerId ?? null);
          } catch (err) {
            failureCount += 1;
            const msg = err instanceof Error ? err.message : "Send failed";
            await logDelivery(pool, campaignId, sub.id, "failed", msg.slice(0, 500), null);
          }
        }),
      );
    }

    const finalStatus = failureCount > 0 && successCount === 0 ? "failed" : "sent";
    await pool.query(
      `UPDATE newsletter_campaigns SET
         status = $2,
         sent_at = now(),
         updated_at = now(),
         recipient_count = $3,
         success_count = $4,
         failure_count = $5
       WHERE id = $1`,
      [campaignId, finalStatus, subs.rows.length, successCount, failureCount],
    );

    return {
      recipientCount: subs.rows.length,
      successCount,
      failureCount,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function logDelivery(
  pool: import("pg").Pool,
  campaignId: string,
  subscriberId: string,
  status: "sent" | "failed" | "skipped",
  errorMessage: string | null,
  providerId: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO newsletter_campaign_deliveries (campaign_id, subscriber_id, status, error_message, provider_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_id, subscriber_id) DO UPDATE SET
       status = EXCLUDED.status,
       error_message = EXCLUDED.error_message,
       provider_id = EXCLUDED.provider_id,
       sent_at = now()`,
    [campaignId, subscriberId, status, errorMessage, providerId],
  );
}

/** Called by cron (and optionally manual trigger) for due scheduled campaigns. */
export async function processScheduledNewsletterCampaigns(): Promise<{ sent: string[]; errors: string[] }> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  const sent: string[] = [];
  const errors: string[] = [];

  try {
    const due = await pool.query<{ id: string }>(
      `SELECT id FROM newsletter_campaigns
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT 10`,
    );

    for (const row of due.rows) {
      try {
        await sendNewsletterCampaign(row.id);
        sent.push(row.id);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    await pool.end().catch(() => undefined);
  }

  return { sent, errors };
}

export async function sendNewsletterCampaignTest(input: {
  campaignId: string;
  toEmail: string;
}): Promise<void> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  try {
    const campRes = await pool.query<CampaignRow>(
      `SELECT id, subject, preview_text, body_html, body_text, status FROM newsletter_campaigns WHERE id = $1`,
      [input.campaignId],
    );
    const campaign = campRes.rows[0];
    if (!campaign) throw new Error("Campaign not found");

    const tokenRes = await pool.query<{ unsubscribe_token: string }>(
      `SELECT unsubscribe_token FROM newsletter_subscribers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [input.toEmail],
    );
    const token = tokenRes.rows[0]?.unsubscribe_token ?? "test-token-not-for-production";

    await sendNewsletterCampaignEmail({
      to: input.toEmail.trim(),
      subject: `[Test] ${campaign.subject}`,
      previewText: campaign.preview_text,
      bodyHtml: campaign.body_html,
      bodyText: campaign.body_text,
      unsubscribeToken: token,
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}
