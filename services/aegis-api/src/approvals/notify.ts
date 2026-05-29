import type pg from "pg";

export type ApprovalNotifyContext = {
  organizationId: string;
  approvalId: string;
  toolName: string;
  traceId: string;
  eventId: string;
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

async function listApproverEmails(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  const override = process.env.APPROVAL_NOTIFY_EMAIL?.trim();
  if (override) {
    return override
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }

  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1
       AND m.role = 'admin'
       AND m.status = 'active'
       AND a.email IS NOT NULL`,
    [organizationId],
  );
  return result.rows.map((r) => r.email).filter(Boolean);
}

function approvalConsoleUrl(approvalId: string): string {
  const origin = (process.env.CONSOLE_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${origin}/aegis/approvals?focus=${encodeURIComponent(approvalId)}`;
}

async function sendSlackApproval(
  webhookUrl: string,
  input: {
    orgName: string;
    orgSlug: string;
    toolName: string;
    approvalId: string;
    traceId: string;
    approveUrl: string;
  },
): Promise<void> {
  const text = [
    `*Approval required* — ${input.orgName}`,
    `Tool: \`${input.toolName}\``,
    `Trace: \`${input.traceId}\``,
    `<${input.approveUrl}|Review in Salanor Console>`,
  ].join("\n");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook failed (${response.status}): ${body}`);
  }
}

async function sendApprovalEmail(
  to: string,
  input: {
    orgName: string;
    toolName: string;
    approveUrl: string;
  },
): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = `Approval required: ${input.toolName}`;
  const bodyText = [
    `A tool call in ${input.orgName} is waiting for your approval.`,
    "",
    `Tool: ${input.toolName}`,
    "",
    `Review and approve in the Salanor Console:`,
    input.approveUrl,
    "",
    "The trace stays blocked until an admin approves or rejects.",
  ].join("\n");

  console.log("\n[aegis-api] ── Approval notification ─────────────────────");
  console.log(`  To:      ${to}`);
  console.log(`  Tool:    ${input.toolName}`);
  console.log(`  Review:  ${input.approveUrl}`);
  console.log("[aegis-api] ─────────────────────────────────────────────────\n");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
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
      html: `<p>A tool call in <strong>${input.orgName}</strong> is waiting for your approval.</p>
<p>Tool: <code>${input.toolName}</code></p>
<p><a href="${input.approveUrl}">Review in Salanor Console</a></p>
<p>The trace stays blocked until an admin approves or rejects.</p>`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${errText}`);
  }
}

/** Fire-and-forget: Slack webhook and/or email to org admins. */
export function notifyApprovalPending(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
): void {
  void (async () => {
    const org = await loadOrgMeta(client, ctx.organizationId);
    if (!org) return;

    const approveUrl = approvalConsoleUrl(ctx.approvalId);
    const slackUrl = process.env.APPROVAL_SLACK_WEBHOOK_URL?.trim();

    if (slackUrl) {
      try {
        await sendSlackApproval(slackUrl, {
          orgName: org.name,
          orgSlug: org.slug,
          toolName: ctx.toolName,
          approvalId: ctx.approvalId,
          traceId: ctx.traceId,
          approveUrl,
        });
      } catch (err) {
        console.error("[aegis-api] approval Slack notify failed:", err);
      }
    }

    const emails = await listApproverEmails(client, ctx.organizationId);
    for (const email of emails) {
      try {
        await sendApprovalEmail(email, {
          orgName: org.name,
          toolName: ctx.toolName,
          approveUrl,
        });
      } catch (err) {
        console.error(`[aegis-api] approval email to ${email} failed:`, err);
      }
    }
  })();
}
