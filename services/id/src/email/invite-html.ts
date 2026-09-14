import { buildBrandedEmailHtml, escapeHtml } from "./branded-email.js";
import type { InviteEmailInput } from "./send-invite.js";

export function buildInviteEmailHtml(input: InviteEmailInput): string {
  const role =
    input.role.charAt(0).toUpperCase() + input.role.slice(1).replace(/_/g, " ");
  const invitedBy = input.invitedByEmail
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5c6660;">Invited by <strong style="color:#0a0c0b;">${escapeHtml(input.invitedByEmail)}</strong></p>`
    : "";

  return buildBrandedEmailHtml({
    title: `Join ${input.organizationName} on Salanor`,
    heading: `Join ${input.organizationName}`,
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">You&apos;ve been invited to collaborate on <strong>${escapeHtml(input.organizationName)}</strong> with the <strong>${escapeHtml(role)}</strong> role.</p>${invitedBy}`,
    ctaLabel: "Accept invitation",
    ctaUrl: input.inviteUrl,
    footerNote:
      "This invitation expires in 7 days. If you didn&apos;t expect this email, you can ignore it.",
  });
}
