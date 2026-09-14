/** Safe OAuth error codes exposed in login redirect (no internal messages). */
export const OAUTH_ERROR_CODES = new Set([
  "access_denied",
  "invalid_state",
  "missing_code",
  "no_account",
  "no_email",
  "no_membership",
  "sso_not_configured",
  "sso_failed",
  "oauth_failed",
  "pending_email_verification",
  "rate_limited",
]);

export function sanitizeOAuthError(raw: string | undefined | null): string {
  const code = raw?.trim().slice(0, 64) ?? "";
  if (OAUTH_ERROR_CODES.has(code)) {
    return code;
  }
  return "oauth_failed";
}
