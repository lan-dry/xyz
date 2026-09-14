/**
 * Stage 5 demo: wrapFetch with hardcoded deny on stripe.paymentIntents.create.
 *
 * Requires: docker compose up, pnpm db:migrate, pnpm db:seed, aegis-api dev
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PolicyDeniedError, wrapFetch } from "@salanor/aegis";

function loadEnvFile(): void {
  const root = resolve(import.meta.dirname, "../..");
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

const organizationId = "11111111-1111-4111-8111-111111111111";
const agentId = "agent-dev-01";
const keyId = "key-dev-01";
const ingestKey = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const privateKeyB64 = process.env.DEV_SIGNING_PRIVATE_KEY_B64;
const apiBaseUrl = process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080";

if (!privateKeyB64) {
  console.error("Set DEV_SIGNING_PRIVATE_KEY_B64 in .env");
  process.exit(1);
}

const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const sign = { privateKeyB64, keyId };
const ingest = { apiBaseUrl, ingestApiKey: ingestKey };

let upstreamCalls = 0;
const upstream = createServer((_req, res) => {
  upstreamCalls += 1;
  res.writeHead(200);
  res.end("ok");
});

await new Promise<void>((resolvePromise) => {
  upstream.listen(0, "127.0.0.1", () => resolvePromise());
});

const addr = upstream.address();
if (!addr || typeof addr === "string") {
  throw new Error("upstream listen failed");
}
const upstreamUrl = `http://127.0.0.1:${addr.port}/`;

const baseContext = {
  organizationId,
  agentId,
  keyId,
  traceId,
};

try {
  upstreamCalls = 0;
  try {
    await wrapFetch(upstreamUrl, { method: "GET" }, {
      context: { ...baseContext, toolName: "stripe.paymentIntents.create" },
      sign,
      ingest,
    });
    console.error("Expected PolicyDeniedError for stripe.paymentIntents.create");
    process.exit(1);
  } catch (err) {
    if (!(err instanceof PolicyDeniedError)) {
      throw err;
    }
  }
  console.log(
    JSON.stringify(
      { scenario: "deny", upstream_calls: upstreamCalls, trace_id: traceId },
      null,
      2,
    ),
  );

  upstreamCalls = 0;
  const allowRes = await wrapFetch(upstreamUrl, { method: "GET" }, {
    context: { ...baseContext, toolName: "demo.echo" },
    sign,
    ingest,
  });
  console.log(
    JSON.stringify(
      {
        scenario: "allow",
        upstream_calls: upstreamCalls,
        http_status: allowRes.status,
        trace_id: traceId,
      },
      null,
      2,
    ),
  );
} finally {
  upstream.close();
}
