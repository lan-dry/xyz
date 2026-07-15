import { initObservability } from "@salanor/observability";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

initObservability("salanor-id");

const port = Number(process.env.SALANOR_ID_PORT ?? process.env.PORT ?? 8091);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`salanor-id listening on http://localhost:${info.port}`);
});
