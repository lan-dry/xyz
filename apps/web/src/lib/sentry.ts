/** Report to Sentry when `SENTRY_DSN` is set (no-op otherwise). */
export async function captureException(error: unknown): Promise<void> {
  if (!process.env.SENTRY_DSN?.trim()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureException(error);
}
