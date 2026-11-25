import { buildBrandedEmailHtml, escapeHtml } from "./branded-email.js";
import { sendTransactionalEmail } from "./email-delivery.js";

export type SandboxInviteEmailInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  invitedByEmail?: string | null;
  fromAddress?: string;
  replyTo?: string;
  organizationId?: string | null;
};

export function buildSandboxInviteEmailHtml(input: SandboxInviteEmailInput): string {
  const invitedBy = input.invitedByEmail
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5c6660;">Approved by <strong style="color:#0a0c0b;">${escapeHtml(input.invitedByEmail)}</strong></p>`
    : "";
  return buildBrandedEmailHtml({
    title: "Your Aegis sandbox is ready",
    heading: "Your sandbox is ready",
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">Your request for an Aegis sandbox for <strong>${escapeHtml(input.organizationName)}</strong> was approved.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">Set a password and open the console to start exploring. The sandbox expires in 30 days.</p>${invitedBy}`,
    ctaLabel: "Set password and open console",
    ctaUrl: input.inviteUrl,
    footerNote: "This invitation expires in 7 days. If you did not request a sandbox, you can ignore this email.",
  });
}

export async function sendSandboxInviteEmail(
  input: SandboxInviteEmailInput,
): Promise<void> {
  const subject = "Your Aegis sandbox is ready";
  const html = buildSandboxInviteEmailHtml(input);
  const bodyText = [
    `Your Aegis sandbox for ${input.organizationName} is ready.`,
    "",
    "Set a password and open the console:",
    input.inviteUrl,
    "",
    "The sandbox expires in 30 days. This link expires in 7 days.",
  ].join("\n");

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
