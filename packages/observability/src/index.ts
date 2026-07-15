import * as Sentry from "@sentry/node";

let initialized = false;

export function initObservability(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    serverName: serviceName,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05"),
  });
  initialized = true;
}

export function captureException(
  err: unknown,
  context?: Record<string, string>,
): void {
  console.error("[error]", err, context ?? "");
  if (!process.env.SENTRY_DSN?.trim()) return;
  if (!initialized) {
    initObservability(process.env.SERVICE_NAME ?? "salanor");
  }
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        scope.setTag(k, v);
      }
    }
    Sentry.captureException(err);
  });
}
