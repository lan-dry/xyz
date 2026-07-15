import { contactEmailForReason } from "./site-contact";
import { sendEmailViaResend } from "./send-email-resend";

export type ContactEmailPayload = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  sourcePath: string;
};

function resolveNotifyTo(reason: string): string {
  return (
    process.env.CONTACT_NOTIFY_EMAIL?.trim() ??
    contactEmailForReason(reason)
  );
}

export async function sendContactNotification(
  row: ContactEmailPayload,
): Promise<{ sent: boolean; skipped?: string }> {
  const to = resolveNotifyTo(row.reason);
  const subject = `[Salanor contact] ${row.reason.replace(/_/g, " ")} — ${row.name}`;
  const text = [
    `New contact form submission (${row.id})`,
    "",
    `Topic: ${row.reason}`,
    `Name: ${row.name}`,
    `Email: ${row.email}`,
    row.organization ? `Organization: ${row.organization}` : null,
    row.role ? `Title: ${row.role}` : null,
    `Source: ${row.sourcePath}`,
    "",
    "Message:",
    row.message,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`;

  try {
    const result = await sendEmailViaResend({ to, subject, text, html });
    if (!result.sent && process.env.NODE_ENV === "development") {
      console.info(`[contact] email skipped (${result.reason}) — ${row.id}`);
    }
    return result;
  } catch (err) {
    console.error("[contact] Resend failed", err);
    throw err;
  }
}
