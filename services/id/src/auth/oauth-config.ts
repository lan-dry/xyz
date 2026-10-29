export type SocialOAuthProvider = "google" | "github";

export function oauthEnabled(): { google: boolean; github: boolean } {
  return {
    google: Boolean(
      process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim(),
    ),
    github: Boolean(
      process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim(),
    ),
  };
}

export function workosEnabled(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY?.trim() && process.env.WORKOS_CLIENT_ID?.trim(),
  );
}

/** Pilot map: org slug (lowercase) → WorkOS organization id. */
export function parseEnvWorkosOrgMap(): Record<string, string> {
  const raw = process.env.SSO_WORKOS_ORG_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]),
    );
  } catch {
    return {};
  }
}

export function consoleOrigin(): string {
  return process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
}

export function oauthCallbackUrl(provider: SocialOAuthProvider): string {
  return `${consoleOrigin()}/api/id/auth/oauth/${provider}/callback`;
}

export function ssoCallbackUrl(): string {
  return `${consoleOrigin()}/api/id/auth/sso/callback`;
}
