import { humanizeUpstreamBody } from "./sanitize-upstream-body.js";

export function formatUpstreamError(body: string, status: number): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return `The AI service returned an error (${status}).`;
  }
  const htmlMessage = humanizeUpstreamBody(trimmed, status);
  if (htmlMessage) {
    return htmlMessage;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string };
      message?: string;
    };
    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  } catch {
    /* plain text */
  }
  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
}
