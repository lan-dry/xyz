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

export function consoleOrigin(): string {
  return process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
}

export function oauthCallbackUrl(provider: SocialOAuthProvider): string {
  return `${consoleOrigin()}/api/id/auth/oauth/${provider}/callback`;
}

export function ssoCallbackUrl(): string {
  return `${consoleOrigin()}/api/id/auth/sso/callback`;
}
