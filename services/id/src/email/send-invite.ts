export type InviteEmailInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: string;
  invitedByEmail?: string | null;
};

import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";
import { buildInviteEmailHtml } from "./invite-html.js";

export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const from = getInviteFromAddress();
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

  const apiKey = getResendApiKey();
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
    throw new EmailDeliveryError("email_send_failed", "Failed to send invite email");
  }
}
