import { SITE_ORIGIN } from "@/lib/site-origin";

const POSTAL = "Salanor Ltd · Kigali, Rwanda";

export function newsletterEmailLayout(input: {
  preheader?: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const preheader = input.preheader?.trim() ?? "";
  const footer =
    input.footerHtml ??
    `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #30363d;font-size:13px;line-height:1.5;color:#8b949e;">
      ${POSTAL}<br />
      <a href="${SITE_ORIGIN}" style="color:#43c2a9;text-decoration:none;">www.salanor.com</a>
    </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Salanor</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d1117;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#161b22;border:1px solid #30363d;border-radius:12px;">
          <tr>
            <td style="padding:24px 28px 12px;">
              <a href="${SITE_ORIGIN}" style="text-decoration:none;display:inline-block;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:10px;">
                      <img src="${SITE_ORIGIN}/salanor-logo.png" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;" />
                    </td>
                    <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#f0f6fc;letter-spacing:-0.02em;">Salanor</td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:16px;line-height:1.65;color:#c9d1d9;">
              ${input.bodyHtml}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
