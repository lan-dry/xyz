import { initObservability } from "@salanor/observability";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

initObservability("salanor-id");

const port = Number(process.env.PORT ?? process.env.SALANOR_ID_PORT ?? 8091);

serve({ fetch: app.fetch, port, hostname: "::" }, (info) => {
  console.log(`salanor-id listening on http://[::]:${info.port}`);
});
