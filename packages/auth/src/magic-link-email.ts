import { createTransport } from "nodemailer";

type SendMagicLinkParams = {
  identifier: string;
  url: string;
  provider: {
    from?: string;
    server?: Parameters<typeof createTransport>[0];
  };
};

const AUTH_JS_NODEMAILER_PLACEHOLDER_HOST = "localhost";

/** Prefer EMAIL_SERVER — Auth.js Nodemailer defaults leave provider.server on localhost:25. */
export function resolveSmtpServer(
  provider: SendMagicLinkParams["provider"],
): NonNullable<Parameters<typeof createTransport>[0]> {
  const fromEnv = process.env.EMAIL_SERVER?.trim();
  const fromProvider = provider.server;

  if (typeof fromProvider === "string" && fromProvider.trim()) {
    return fromProvider;
  }

  if (fromProvider && typeof fromProvider === "object") {
    const host = "host" in fromProvider ? String(fromProvider.host) : "";
    if (host && host !== AUTH_JS_NODEMAILER_PLACEHOLDER_HOST) {
      return fromProvider;
    }
  }

  if (fromEnv) return fromEnv;

  throw new Error("EMAIL_SERVER is not configured");
}

/** Host shown in magic-link copy — matches the sign-in origin when trustHost is enabled. */
export function formatAuthSignInHost(magicLinkUrl: string): string {
  try {
    return new URL(magicLinkUrl).host;
  } catch {
    const fallback = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
    if (fallback) {
      try {
        return new URL(fallback).host;
      } catch {
        return fallback.replace(/^https?:\/\//, "");
      }
    }
    return "localhost:3000";
  }
}

function shouldLogMagicLinkToConsole(): boolean {
  return process.env.NODE_ENV === "development" || process.env.SALANOR_ENV?.trim() === "local";
}

export async function sendSalanorMagicLinkEmail({
  identifier,
  url,
  provider,
}: SendMagicLinkParams): Promise<void> {
  const host = formatAuthSignInHost(url);
  const from = provider.from ?? process.env.EMAIL_FROM ?? "noreply@salanor.com";
  const transport = createTransport(resolveSmtpServer(provider));

  if (shouldLogMagicLinkToConsole()) {
    console.info(`[auth] magic link for ${identifier}: ${url}`);
  }

  try {
    const result = await transport.sendMail({
      to: identifier,
      from,
      subject: `Sign in to ${host}`,
      text: `Sign in to ${host}\n\n${url}\n\nIf you did not request this email, you can ignore it.`,
      html: `<p>Sign in to <strong>${host}</strong></p><p><a href="${url}">Sign in</a></p><p>If you did not request this email, you can ignore it.</p>`,
    });

    const rejected = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
    if (rejected.length) {
      throw new Error(`Email (${rejected.join(", ")}) could not be sent`);
    }
  } catch (error) {
    console.error("[auth] magic link email failed", {
      to: identifier,
      from,
      signInHost: host,
      error,
    });
    throw error;
  }
}
