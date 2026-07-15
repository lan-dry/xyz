/** Public verifier page — shareable without console login. */
export function publicVerifyBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_CONSOLE_URL ??
    process.env.NEXT_PUBLIC_AEGIS_CONSOLE_URL ??
    "http://localhost:3000"
  );
}

export function buildPublicVerifyUrl(
  organizationSlug: string,
  eventId: string,
): string {
  const url = new URL("/verify", publicVerifyBaseUrl());
  url.searchParams.set("org", organizationSlug.trim());
  url.searchParams.set("event", eventId.trim());
  return url.toString();
}

export function buildPublicVerifyCliCommand(
  organizationSlug: string,
  eventId: string,
): string {
  return `pnpm verifier:public -- --org ${organizationSlug.trim()} --event ${eventId.trim()}`;
}
