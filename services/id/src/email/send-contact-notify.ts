import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";

export type ContactNotifyInput = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  sourcePath: string;
};

function notifyTo(reason: string): string {
  const override = process.env.CONTACT_NOTIFY_EMAIL?.trim();
  if (override) return override;
  if (reason === "press") return "press@salanor.com";
  if (reason === "security") return "security@salanor.com";
  return "partners@salanor.com";
}

/** Best-effort Ops notification. Missing Resend config is a soft skip, not a hard failure. */
export async function sendContactLeadEmail(
  input: ContactNotifyInput,
): Promise<{ sent: boolean; skipped?: string }> {
  let apiKey: string;
  try {
    apiKey = getResendApiKey();
  } catch (err) {
    if (err instanceof EmailDeliveryError && err.code === "email_not_configured") {
      return { sent: false, skipped: "RESEND_API_KEY not configured" };
    }
    throw err;
  }

  const to = notifyTo(input.reason);
  const from = getInviteFromAddress();
  const subject = `[Salanor contact] ${input.reason.replace(/_/g, " ")} · ${input.name}`;
  const text = [
    `New contact form submission (${input.id})`,
    "",
    `Topic: ${input.reason}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.organization ? `Organization: ${input.organization}` : null,
    input.role ? `Title: ${input.role}` : null,
    `Source: ${input.sourcePath}`,
    "",
    "Message:",
    input.message,
  ]
    .filter(Boolean)
    .join("\n");

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
      text,
      html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[salanor-id] contact notify failed:", response.status, body);
    return { sent: false, skipped: `resend_${response.status}` };
  }
  return { sent: true };
}
