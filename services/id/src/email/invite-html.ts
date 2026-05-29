import type { InviteEmailInput } from "./send-invite.js";

export function buildInviteEmailHtml(input: InviteEmailInput): string {
  const role =
    input.role.charAt(0).toUpperCase() + input.role.slice(1).replace(/_/g, " ");
  const invitedBy = input.invitedByEmail
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5c6660;">Invited by <strong style="color:#0a0c0b;">${escapeHtml(input.invitedByEmail)}</strong></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Join ${escapeHtml(input.organizationName)} on Salanor</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8e4;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;background:linear-gradient(135deg,#0f766e 0%,#0d5c56 100%);">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.15);text-align:center;vertical-align:middle;font-size:18px;font-weight:700;color:#fff;">S</td>
                  <td style="padding-left:12px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Salanor · Aegis</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.02em;color:#0a0c0b;">Join ${escapeHtml(input.organizationName)}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">You&apos;ve been invited to collaborate on <strong>${escapeHtml(input.organizationName)}</strong> with the <strong>${escapeHtml(role)}</strong> role.</p>
              ${invitedBy}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#0f766e;">
                    <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Accept invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#8a9490;">Or paste this link into your browser:</p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0f766e;"><a href="${escapeHtml(input.inviteUrl)}" style="color:#0f766e;">${escapeHtml(input.inviteUrl)}</a></p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9490;">This invitation expires in 7 days. If you didn&apos;t expect this email, you can ignore it.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e2e8e4;font-size:11px;color:#8a9490;line-height:1.5;">
              Salanor — litigation-ready provenance for autonomous systems.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
