/** Shared branded HTML shell for Salanor transactional email. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type BrandedEmailContent = {
  title: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
};

const EMAIL_LOGO_URL =
  process.env.EMAIL_LOGO_URL?.trim() ??
  "https://www.salanor.com/salanor-mark-white.png";

export function buildBrandedEmailHtml(content: BrandedEmailContent): string {
  const url = escapeHtml(content.ctaUrl);
  const logoUrl = escapeHtml(EMAIL_LOGO_URL);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8e4;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px 20px;background:linear-gradient(135deg,#0f766e 0%,#0d5c56 100%);">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" width="40" height="40" alt="Salanor" style="display:block;border:0;border-radius:10px;" />
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.92);">Salanor · Aegis</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.02em;color:#0a0c0b;">${escapeHtml(content.heading)}</h1>
              ${content.bodyHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#0f766e;">
                    <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(content.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#8a9490;">Or paste this link into your browser:</p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0f766e;"><a href="${url}" style="color:#0f766e;">${url}</a></p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9490;">${content.footerNote}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e2e8e4;font-size:11px;color:#8a9490;line-height:1.5;">
              Salanor Ltd · 1 KN 78 St, Kigali<br />
              Litigation-ready provenance for autonomous systems.<br />
              <a href="https://www.salanor.com" style="color:#0f766e;text-decoration:none;">salanor.com</a>
              ·
              <a href="https://www.salanor.com/legal/privacy" style="color:#0f766e;text-decoration:none;">Privacy</a>
              ·
              <a href="https://www.salanor.com/contact" style="color:#0f766e;text-decoration:none;">Contact</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#8a9490;max-width:520px;line-height:1.5;">
          This message was sent by Salanor regarding your Aegis console account. If you did not expect it, you can ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
