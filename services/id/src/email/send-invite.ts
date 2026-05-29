export type InviteEmailInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: string;
  invitedByEmail?: string | null;
};

/**
 * Dev: always logs the invite link to the ID service terminal.
 * Production: set RESEND_API_KEY to deliver via Resend (no extra npm deps).
 */
import { buildInviteEmailHtml } from "./invite-html.js";

export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = `Join ${input.organizationName} on Salanor`;
  const html = buildInviteEmailHtml(input);
  const bodyText = [
    `You've been invited to ${input.organizationName} on Salanor.`,
    `Role: ${input.role}`,
    input.invitedByEmail ? `Invited by: ${input.invitedByEmail}` : null,
    "",
    `Accept your invitation:`,
    input.inviteUrl,
    "",
    "This link expires in 7 days.",
  ]
    .filter(Boolean)
    .join("\n");

  console.log("\n[salanor-id] ── Organization invite ─────────────────────────");
  console.log(`  To:      ${input.to}`);
  console.log(`  Org:     ${input.organizationName}`);
  console.log(`  Role:    ${input.role}`);
  console.log(`  Accept:  ${input.inviteUrl}`);
  console.log("[salanor-id] ─────────────────────────────────────────────────\n");

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
      to: [input.to],
      subject,
      text: bodyText,
      html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[salanor-id] Resend delivery failed:", response.status, errText);
    throw new Error("Failed to send invite email");
  }
}
