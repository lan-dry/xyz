import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn?.trim()),
  tracesSampleRate: 0.05,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
