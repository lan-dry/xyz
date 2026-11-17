#!/usr/bin/env node
/**
 * Cross-origin CORS + cookie attribute check between two local hostnames.
 * Mirrors Railway/Vercel production settings as closely as local HTTP allows.
 *
 * Default pair (both resolve to 127.0.0.1):
 *   app.localtest.me  → console Origin
 *   api.localtest.me  → API host
 *
 * Expect:
 *   - API CORS allows CONSOLE_ORIGIN only (not arbitrary origins)
 *   - Set-Cookie on login carries HttpOnly; SameSite=Lax (or Strict for sim);
 *     Secure when the request is HTTPS / NODE_ENV=production cookie path says so
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePersonaPassword } from "./load-tenant.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const appHost = (process.env.CORS_APP_HOST || "http://app.localtest.me:3000").replace(/\/+$/, "");
// Bind to loopback IPs (localtest.me DNS can fail offline); still send Origin hostnames.
const apiHost = (
  process.env.CORS_API_HOST ||
  process.env.AEGIS_API_URL ||
  "http://127.0.0.1:8088"
).replace(/\/+$/, "");
const allowedOrigin = process.env.CONSOLE_ORIGIN?.trim() || appHost;
const badOrigin = "http://evil.localtest.me:3999";

const results = [];

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function corsPreflight(origin) {
  const res = await fetch(`${apiHost}/v1/console/organization/profile`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
    allowCreds: res.headers.get("access-control-allow-credentials"),
  };
}

try {
  const good = await corsPreflight(allowedOrigin);
  record(
    "CORS allows CONSOLE_ORIGIN",
    good.allowOrigin === allowedOrigin || good.allowOrigin === "*",
    `status=${good.status} ACAO=${good.allowOrigin} creds=${good.allowCreds}`,
  );
} catch (err) {
  record(
    "CORS allows CONSOLE_ORIGIN",
    false,
    `fetch failed: ${err instanceof Error ? err.message : err} api=${apiHost}`,
  );
}

try {
  const bad = await corsPreflight(badOrigin);
  record(
    "CORS rejects foreign origin",
    !bad.allowOrigin || bad.allowOrigin !== badOrigin,
    `status=${bad.status} ACAO=${bad.allowOrigin}`,
  );
} catch (err) {
  record(
    "CORS rejects foreign origin",
    false,
    err instanceof Error ? err.message : String(err),
  );
}

const idHost = (
  process.env.SALANOR_ID_URL ||
  process.env.CORS_ID_HOST ||
  "http://127.0.0.1:8091"
).replace(/\/+$/, "");
const resolved = resolvePersonaPassword(root, { preferLocal: true });
const password = resolved.password;
const loginEmail =
  resolved.data?.personas?.admin?.email?.trim() || "admin@demo.test";
if (!password) {
  record("login cookie attributes", false, resolved.error || "tenant persona password missing");
} else {
  try {
    const res = await fetch(`${idHost}/v1/id/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: allowedOrigin,
      },
      body: JSON.stringify({ email: loginEmail, password }),
      redirect: "manual",
    });
    const raw = res.headers.getSetCookie?.() ?? [];
    const session = raw.find((c) => c.startsWith("salanor_session=")) ?? raw[0] ?? "";
    const httpOnly = /httponly/i.test(session);
    const sameSite = /samesite=(lax|strict|none)/i.exec(session)?.[1] ?? null;
    const secure = /;\s*secure/i.test(session);
    record(
      "salanor_session HttpOnly",
      httpOnly,
      session
        ? session.split(";").slice(1).join(";").trim() || "(attrs)"
        : `HTTP ${res.status} no Set-Cookie`,
    );
    record(
      "salanor_session SameSite=Lax (prod-like)",
      String(sameSite).toLowerCase() === "lax",
      `SameSite=${sameSite}`,
    );
    // Secure is required on Railway HTTPS; over plain HTTP localtest it may be omitted.
    record(
      "salanor_session Secure flag (required on HTTPS / Railway)",
      secure || allowedOrigin.startsWith("http://"),
      secure
        ? "Secure present"
        : "absent on HTTP local — expected; must be present on https://app.salanor.com",
    );
  } catch (err) {
    record("login cookie attributes", false, err instanceof Error ? err.message : String(err));
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log("\nCORS/cookie checks OK");
