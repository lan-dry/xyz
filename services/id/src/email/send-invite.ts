export type InviteEmailInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: string;
  invitedByEmail?: string | null;
  fromAddress?: string;
  replyTo?: string;
  organizationId?: string | null;
};

import { sendTransactionalEmail } from "./email-delivery.js";
import { buildInviteEmailHtml } from "./invite-html.js";

export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
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

  await sendTransactionalEmail({
    to: input.to,
    subject,
    text: bodyText,
    html,
    fromAddress: input.fromAddress,
    replyTo: input.replyTo,
    organizationId: input.organizationId,
  });
}
