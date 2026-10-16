import { initObservability } from "@salanor/observability";
import { serve } from "@hono/node-server";
import "./db/load-env.js";
import { createApp } from "./app.js";
import { startRetentionScheduler } from "./compliance/retention-scheduler.js";

initObservability("stoa-api");

const port = Number(process.env.STOA_API_PORT ?? process.env.PORT ?? 8094);
const app = createApp();
const stopRetentionScheduler = startRetentionScheduler();

serve({ fetch: app.fetch, port, hostname: "::" }, (info) => {
  console.log(`stoa-api listening on http://[::]:${info.port}`);
});

function shutdown(): void {
  stopRetentionScheduler();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
