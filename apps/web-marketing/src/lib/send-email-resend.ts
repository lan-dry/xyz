/**
 * Transactional email via Resend HTTP API (same pattern as salanor-id invite/reset).
 * Set RESEND_API_KEY; optional INVITE_EMAIL_FROM or EMAIL_FROM for the From header.
 */
export async function sendEmailViaResend(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const from =
    process.env.EMAIL_FROM?.trim() ??
    process.env.INVITE_EMAIL_FROM?.trim() ??
    "Salanor <noreply@salanor.com>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API ${response.status}: ${body.slice(0, 200)}`);
  }

  return { sent: true };
}
