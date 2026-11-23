#!/usr/bin/env node
/**
 * Gate 0: deploy-to-staging checklist + smoke. Does not touch production.
 */
import { spawnSync } from "node:child_process";

const api = (process.env.STAGING_API_BASE ?? "").replace(/\/+$/, "");
if (!api) {
  console.error("Set STAGING_API_BASE (e.g. https://staging-api.example.com)");
  process.exit(2);
}

console.log("release-staging: API base", api);
console.log("release-staging: ensure staging services are deployed, then running smoke…");

const env = {
  ...process.env,
  SMOKE_API_BASE: api,
  AEGIS_API_URL: api,
  PUBLIC_API_BASE: api,
};

const smoke = spawnSync("node", ["tools/smoke/smoke-production.mjs"], {
  env,
  encoding: "utf8",
  stdio: "inherit",
});

if (smoke.status !== 0) {
  console.error("release-staging: smoke failed — do not promote");
  process.exit(smoke.status ?? 1);
}

console.log("OK_TO_PROMOTE");
console.log("release-staging: promote by deploying the same commit to production (manual).");
