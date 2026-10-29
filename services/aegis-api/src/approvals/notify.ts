import type pg from "pg";
import {
  getGovernanceSettings,
  type GovernanceSettings,
} from "../repo/governance-settings.js";
import { buildRequestPreview } from "./request-preview.js";
import { signApprovalActionToken } from "./action-token.js";

export type ApprovalNotifyContext = {
  organizationId: string;
  approvalId: string;
  toolName: string;
  traceId: string;
  eventId: string;
  requestSummary?: string;
  amountUsd?: number;
  recipient?: string;
};

async function loadOrgMeta(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ slug: string; name: string } | null> {
  const result = await client.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows[0] ?? null;
}

async function enrichFromEvent(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
): Promise<ApprovalNotifyContext> {
  const result = await client.query<{ payload: unknown }>(
    `SELECT payload FROM event WHERE event_id = $1`,
    [ctx.eventId],
  );
  const payload =
    result.rows[0]?.payload && typeof result.rows[0].payload === "object"
      ? (result.rows[0].payload as Record<string, unknown>)
      : null;
  const preview = buildRequestPreview(payload);
  const recipient =
    preview.fields.find((f) => f.key === "recipient")?.value ??
    preview.fields.find((f) => f.key === "to")?.value;

  return {
    ...ctx,
    amountUsd: ctx.amountUsd ?? preview.amount_usd,
    requestSummary: ctx.requestSummary ?? preview.summary,
    recipient: ctx.recipient ?? recipient,
  };
}

/**
 * Email recipients for pending approvals: active org admins only.
 * Same people who can Approve/Reject in Console (org write roles).
 * Never use a global env override: that breaks multi-tenant orgs.
 */
async function listApproverEmails(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1
       AND lower(m.role) IN ('admin', 'owner')
       AND m.status = 'active'
       AND a.email IS NOT NULL
       AND length(trim(a.email)) > 0`,
    [organizationId],
  );
  return result.rows.map((r) => r.email.trim()).filter(Boolean);
}

function approvalConsoleUrl(approvalId: string): string {
  const origin = (process.env.CONSOLE_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${origin}/aegis/approvals?focus=${encodeURIComponent(approvalId)}`;
}

function ttlLabel(hours: number): string {
  if (hours === 1) return "1 hour";
  if (hours < 24) return `${hours} hours`;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24 hours" : `${days} days`;
  }
  return `${hours} hours`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slackActionUrl(
  organizationId: string,
  approvalId: string,
  decision: "approved" | "rejected",
  ttlHours: number,
): string {
  const origin = (process.env.CONSOLE_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const exp = Date.now() + Math.max(ttlHours, 1) * 60 * 60 * 1000;
  const token = signApprovalActionToken({
    approvalId,
    organizationId,
    decision,
    exp,
  });
  return `${origin}/aegis/approvals/act?token=${encodeURIComponent(token)}`;
}

async function sendTeamsApproval(
  webhookUrl: string,
  input: {
    organizationId: string;
    approvalId: string;
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const approveBtn = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "approved",
    input.ttlHours,
  );
  const declineBtn = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "rejected",
    input.ttlHours,
  );
  const facts: Array<{ name: string; value: string }> = [
    { name: "Tool", value: input.toolName },
  ];
  if (input.amountUsd != null) {
    facts.push({ name: "Amount", value: `$${input.amountUsd.toLocaleString()} USD` });
  }
  if (input.recipient) {
    facts.push({ name: "Recipient", value: input.recipient });
  }
  if (input.requestSummary) {
    facts.push({ name: "Summary", value: input.requestSummary });
  }
  facts.push({ name: "Expires", value: ttlLabel(input.ttlHours) });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: `Ask a person · ${input.orgName}`,
                weight: "Bolder",
                size: "Medium",
              },
              {
                type: "FactSet",
                facts,
              },
            ],
            actions: [
              {
                type: "Action.OpenUrl",
                title: "Approve",
                url: approveBtn,
              },
              {
                type: "Action.OpenUrl",
                title: "Decline",
                url: declineBtn,
              },
              {
                type: "Action.OpenUrl",
                title: "Open in Console",
                url: input.approveUrl,
              },
            ],
          },
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Teams webhook failed (${response.status}): ${body}`);
  }
}

async function sendSlackApproval(
  webhookUrl: string,
  input: {
    organizationId: string;
    approvalId: string;
    orgName: string;
    toolName: string;
    traceId: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const lines = [
    `*Ask a person* · ${input.orgName}`,
    `Action: Customer refund / \`${input.toolName}\``,
  ];
  if (input.amountUsd != null) {
    lines.push(`Amount: *$${input.amountUsd.toLocaleString()} USD*`);
  }
  if (input.recipient) {
    lines.push(`Recipient: ${input.recipient}`);
  }
  if (input.requestSummary) {
    lines.push(input.requestSummary);
  }
  lines.push(
    `Expires in ${ttlLabel(input.ttlHours)}`,
    `<${input.approveUrl}|Open in Console>`,
  );

  const approveBtn = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "approved",
    input.ttlHours,
  );
  const declineBtn = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "rejected",
    input.ttlHours,
  );

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: lines.join("\n"),
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n") },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve", emoji: true },
              style: "primary",
              url: approveBtn,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Decline", emoji: true },
              style: "danger",
              url: declineBtn,
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook failed (${response.status}): ${body}`);
  }
}

/** Public HTTPS origin for email images (clients cannot load localhost). */
function emailAssetOrigin(): string {
  const raw =
    process.env.EMAIL_ASSET_ORIGIN?.trim() ||
    process.env.MARKETING_PUBLIC_ORIGIN?.trim() ||
    "https://www.salanor.com";
  return raw.replace(/\/$/, "");
}

/** Inline CID: privacy-blocking clients (Zoho, etc.) still show attached marks. */
const EMAIL_LOGO_CID = "salanor-logo";

function emailLogoAttachment(): {
  path: string;
  filename: string;
  content_id: string;
} {
  return {
    path: `${emailAssetOrigin()}/salanor-mark-white.png`,
    filename: "salanor-mark-white.png",
    content_id: EMAIL_LOGO_CID,
  };
}

function emailDetailRow(
  label: string,
  valueHtml: string,
  opts?: { last?: boolean },
): string {
  const border = opts?.last ? "" : "border-bottom:1px solid #e8eceb;";
  return `<tr>
  <td style="padding:12px 16px;${border}width:128px;vertical-align:top;font-size:13px;line-height:1.4;color:#5c6b68;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(label)}</td>
  <td style="padding:12px 16px;${border}vertical-align:top;font-size:14px;line-height:1.45;color:#0a0c0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${valueHtml}</td>
</tr>`;
}

function approvalEmailHtml(input: {
  organizationId: string;
  approvalId: string;
  orgName: string;
  toolName: string;
  approveUrl: string;
  ttlHours: number;
  requestSummary?: string;
  amountUsd?: number;
  recipient?: string;
}): string {
  const logoUrl = `cid:${EMAIL_LOGO_CID}`;
  const approveAct = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "approved",
    input.ttlHours,
  );
  const declineAct = slackActionUrl(
    input.organizationId,
    input.approvalId,
    "rejected",
    input.ttlHours,
  );

  const rows: string[] = [];
  rows.push(
    emailDetailRow(
      "Action",
      `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#0a0c0b;">${escapeHtml(input.toolName)}</span>`,
    ),
  );
  if (input.amountUsd != null) {
    rows.push(
      emailDetailRow(
        "Amount",
        `<strong style="font-size:15px;font-weight:600;">$${escapeHtml(input.amountUsd.toLocaleString())} USD</strong>`,
      ),
    );
  }
  if (input.recipient) {
    rows.push(emailDetailRow("Recipient", escapeHtml(input.recipient)));
  }
  if (input.requestSummary) {
    rows.push(emailDetailRow("Summary", escapeHtml(input.requestSummary)));
  }
  rows.push(
    emailDetailRow("Expires in", escapeHtml(ttlLabel(input.ttlHours)), {
      last: true,
    }),
  );

  const amountBit =
    input.amountUsd != null
      ? `$${input.amountUsd.toLocaleString()} · `
      : "";
  const preheader = `${amountBit}${input.toolName} in ${input.orgName} is waiting for your decision.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Approval required</title>
</head>
<body style="margin:0;padding:0;background:#eef2f1;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #d9e0de;border-radius:4px;overflow:hidden;">
          <tr>
            <td style="background:#0d3535;padding:22px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${escapeHtml(logoUrl)}" width="28" height="28" alt="" style="display:block;border:0;width:28px;height:28px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.04em;color:#43c2a9;">SALANOR</p>
                    <p style="margin:2px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.72);">Aegis</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:3px;background:#43c2a9;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:600;color:#0a0c0b;">Action needs your approval</h1>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#3d4a47;">
                An agent in <strong style="color:#0a0c0b;">${escapeHtml(input.orgName)}</strong> requested a governed action. It stays paused until you approve or decline.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8f7;border:1px solid #e0e6e4;border-radius:4px;margin:0 0 24px;">
                ${rows.join("")}
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding-right:10px;padding-bottom:10px;">
                    <a href="${escapeHtml(approveAct)}" style="display:inline-block;background:#0d3535;color:#ffffff;padding:12px 22px;border-radius:4px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1;">Approve</a>
                  </td>
                  <td style="padding-right:10px;padding-bottom:10px;">
                    <a href="${escapeHtml(declineAct)}" style="display:inline-block;background:#ffffff;color:#0a0c0b;padding:11px 20px;border-radius:4px;border:1px solid #c5cecb;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1;">Decline</a>
                  </td>
                </tr>
              </table>
              <p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:#5c6b68;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                Prefer the full case? <a href="${escapeHtml(input.approveUrl)}" style="color:#0d3535;font-weight:600;text-decoration:underline;">Open in Console</a>
              </p>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#7a8a86;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                If nobody decides, this request expires automatically after ${escapeHtml(ttlLabel(input.ttlHours))}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 24px;border-top:1px solid #e8eceb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#7a8a86;">
                You’re receiving this because you’re an administrator of ${escapeHtml(input.orgName)}.
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#9aa8a4;">
                Salanor Aegis · Agent governance
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function approvalEmailSubject(input: {
  orgName: string;
  toolName: string;
  amountUsd?: number;
}): string {
  if (input.amountUsd != null) {
    return `[${input.orgName}] Approve $${input.amountUsd.toLocaleString()} · ${input.toolName}`;
  }
  return `[${input.orgName}] Approval needed · ${input.toolName}`;
}

async function sendApprovalEmail(
  to: string,
  input: {
    organizationId: string;
    approvalId: string;
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = approvalEmailSubject(input);
  const detailLines: string[] = [`Action: ${input.toolName}`];
  if (input.amountUsd != null) {
    detailLines.push(`Amount: $${input.amountUsd.toLocaleString()} USD`);
  }
  if (input.recipient) {
    detailLines.push(`Recipient: ${input.recipient}`);
  }
  if (input.requestSummary) {
    detailLines.push(`Summary: ${input.requestSummary}`);
  }
  const bodyText = [
    `Action needs your approval in ${input.orgName}`,
    "",
    ...detailLines,
    "",
    `Approve: ${slackActionUrl(input.organizationId, input.approvalId, "approved", input.ttlHours)}`,
    `Decline: ${slackActionUrl(input.organizationId, input.approvalId, "rejected", input.ttlHours)}`,
    `Console: ${input.approveUrl}`,
    "",
    `Expires in ${ttlLabel(input.ttlHours)} if not decided.`,
  ].join("\n");

  console.log("\n[aegis-api] Approval notification email");
  console.log(`  To:     ${to}`);
  console.log(`  Tool:   ${input.toolName}`);
  console.log(`  Review: ${input.approveUrl}`);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.log(
      "  Delivery: skipped (RESEND_API_KEY not set: console log only)\n",
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: bodyText,
      html: approvalEmailHtml(input),
      attachments: [emailLogoAttachment()],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.log(`  Delivery: Resend failed (${response.status})\n`);
    throw new Error(`Email delivery failed (${response.status}): ${errText}`);
  }
  console.log("  Delivery: sent via Resend\n");
}

async function sendPagerDutyApproval(
  routingKey: string,
  input: {
    orgName: string;
    toolName: string;
    traceId: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: `aegis-approval-${input.traceId}`,
      payload: {
        summary: `Aegis approval required: ${input.toolName} (${input.orgName})`,
        severity: "warning",
        source: "salanor-aegis",
        custom_details: {
          organization: input.orgName,
          tool_name: input.toolName,
          trace_id: input.traceId,
          amount_usd: input.amountUsd,
          recipient: input.recipient,
          request_summary: input.requestSummary,
          expires_in: ttlLabel(input.ttlHours),
        },
      },
      links: [{ href: input.approveUrl, text: "Review in Salanor Console" }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PagerDuty enqueue failed (${response.status}): ${body}`);
  }
}

async function sendSmsApproval(
  to: string,
  input: {
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    amountUsd?: number;
  },
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return;
  }

  const amountPart =
    input.amountUsd != null ? ` $${input.amountUsd.toLocaleString()}.` : "";
  const body = `Salanor: approval required for ${input.toolName} (${input.orgName}).${amountPart} ${input.approveUrl} Expires ${ttlLabel(input.ttlHours)}.`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`SMS delivery failed (${response.status}): ${errText}`);
  }
}

async function dispatchNotifications(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
  org: { name: string },
  governance: GovernanceSettings,
): Promise<void> {
  const enriched = await enrichFromEvent(client, ctx);
  const approveUrl = approvalConsoleUrl(enriched.approvalId);
  const notify = governance.notifications;
  const ttlHours = governance.approval_ttl_hours;
  const slackUrl =
    notify.slack_webhook_url?.trim() ||
    process.env.APPROVAL_SLACK_WEBHOOK_URL?.trim() ||
    "";

  const payload = {
    organizationId: enriched.organizationId,
    approvalId: enriched.approvalId,
    orgName: org.name,
    toolName: enriched.toolName,
    traceId: enriched.traceId,
    approveUrl,
    ttlHours,
    requestSummary: enriched.requestSummary,
    amountUsd: enriched.amountUsd,
    recipient: enriched.recipient,
  };

  if (slackUrl) {
    try {
      await sendSlackApproval(slackUrl, {
        ...payload,
        organizationId: enriched.organizationId,
        approvalId: enriched.approvalId,
      });
    } catch (err) {
      console.error("[aegis-api] approval Slack notify failed:", err);
    }
  }

  const teamsUrl = notify.teams_webhook_url?.trim() || "";
  if (teamsUrl) {
    try {
      await sendTeamsApproval(teamsUrl, {
        ...payload,
        organizationId: enriched.organizationId,
        approvalId: enriched.approvalId,
      });
    } catch (err) {
      console.error("[aegis-api] approval Teams notify failed:", err);
    }
  }

  if (notify.pagerduty_routing_key) {
    try {
      await sendPagerDutyApproval(notify.pagerduty_routing_key, payload);
    } catch (err) {
      console.error("[aegis-api] approval PagerDuty notify failed:", err);
    }
  }

  if (notify.email_enabled) {
    const emails = await listApproverEmails(client, enriched.organizationId);
    for (const email of emails) {
      try {
        await sendApprovalEmail(email, payload);
      } catch (err) {
        console.error(`[aegis-api] approval email to ${email} failed:`, err);
      }
    }
  }

  if (notify.sms_numbers.length > 0) {
    for (const phone of notify.sms_numbers) {
      try {
        await sendSmsApproval(phone, payload);
      } catch (err) {
        console.error(`[aegis-api] approval SMS to ${phone} failed:`, err);
      }
    }
  }
}

/** Fire-and-forget: email, Slack, PagerDuty, SMS per org governance settings. */
export function notifyApprovalPending(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
): void {
  void (async () => {
    const org = await loadOrgMeta(client, ctx.organizationId);
    if (!org) return;
    const governance = await getGovernanceSettings(client, ctx.organizationId);
    await dispatchNotifications(client, ctx, org, governance);
  })();
}

export function smsDeliveryAvailable(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}
