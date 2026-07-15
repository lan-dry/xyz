import { initObservability } from "@salanor/observability";
import { serve } from "@hono/node-server";
import "./db/load-env.js";
import { createApp } from "./app.js";

initObservability("aegis-api");

const port = Number(process.env.AEGIS_API_PORT ?? process.env.PORT ?? 8080);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`aegis-api listening on http://localhost:${info.port}`);
});
