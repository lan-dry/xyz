import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.BILLING_API_PORT ?? process.env.PORT ?? 8093);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`billing-api listening on http://localhost:${info.port}`);
});
