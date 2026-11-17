import { initObservability } from "@salanor/observability";
import { isPlatformEmailDeliveryConfigured } from "@salanor/platform-auth";
import { serve } from "@hono/node-server";
import "./db/load-env.js";
import { createApp } from "./app.js";
import { isBridgeMasterKeyConfigured } from "./crypto/bridge-key-vault.js";
import { AEGIS_API_DEPLOY_MARKER } from "./deploy-marker.js";
import { assertProductionBoot, ProductionGuardError } from "./boot/production-guards.js";
import { isProductionEnv } from "./boot/production-env.js";
import { getPool } from "./db/pool.js";
import { startTimestampLoop } from "./forensic/receipt-timestamp.js";
import { isLegacyDemoModeEnvSet } from "./time/clock.js";

initObservability("aegis-api");

// Production guards run before anything listens. A failure exits non-zero and
// lists every problem (env var names only, never values).
try {
  const report = await assertProductionBoot(process.env, {
    hasDatabaseEmailProvider: () => isPlatformEmailDeliveryConfigured(getPool()),
  });
  for (const warning of report.warnings) {
    console.warn(`[aegis-api] production warning: ${warning}`);
  }
} catch (err) {
  if (err instanceof ProductionGuardError) {
    console.error(`[aegis-api] ${err.message}`);
  } else {
    console.error(
      "[aegis-api] production guard crashed:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
  process.exit(1);
}
if (
  !isProductionEnv() &&
  (process.env.NODE_ENV ?? "").toLowerCase() === "production"
) {
  console.warn(
    "[aegis-api] NODE_ENV=production but AEGIS_ENV is not production: production boot guards are OFF. Set AEGIS_ENV=production on real deployments.",
  );
}
// AEGIS_DEMO_MODE is retired: ignore if set outside production (production boot already refuses it).
if (!isProductionEnv() && isLegacyDemoModeEnvSet()) {
  console.warn(
    "[aegis-api] AEGIS_DEMO_MODE is set but ignored — demo mode was removed; use is_demo tenants + provision/seed/wipe.",
  );
}

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
  // Trusted time: stamp queued receipts and retry while the TSA is unreachable.
  if (process.env.DATABASE_URL) {
    startTimestampLoop(getPool);
  }
});
