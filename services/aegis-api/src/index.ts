import { initObservability } from "@salanor/observability";
import { serve } from "@hono/node-server";
import "./db/load-env.js";
import { createApp } from "./app.js";
import { isBridgeMasterKeyConfigured } from "./crypto/bridge-key-vault.js";
import { AEGIS_API_DEPLOY_MARKER } from "./deploy-marker.js";

initObservability("aegis-api");

const port = Number(process.env.PORT ?? process.env.AEGIS_API_PORT ?? 8080);
const app = createApp();

serve({ fetch: app.fetch, port, hostname: "::" }, (info) => {
  console.log(
    `aegis-api listening on http://[::]:${info.port} (${AEGIS_API_DEPLOY_MARKER})`,
  );
  if (!isBridgeMasterKeyConfigured()) {
    console.warn(
      "[aegis-api] AEGIS_BRIDGE_MASTER_KEY is not set — Approve/Reject and Workflow Bridge key vault will fail until you add it to .env and restart.",
    );
  }
});
