import { serve } from "@hono/node-server";
import "./db/load-env.js";
import { app } from "./app.js";

const port = Number(
  process.env.INSURANCE_API_PORT ?? process.env.PORT ?? 8092,
);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`insurance-api listening on http://localhost:${info.port}`);
});
