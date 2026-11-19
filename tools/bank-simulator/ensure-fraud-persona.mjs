/** Ensure fraud@demo-bank.local exists with fraud_analyst bank role. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const tenantPath =
  process.env.DEMO_TENANT_FILE?.trim() ||
  resolve(root, ".demo-tenant-local-stack.local.json");
const file = JSON.parse(readFileSync(tenantPath, "utf8"));
const fraud = file.personas?.fraud;
if (!fraud?.email || !fraud?.password) {
  console.error("No fraud persona in", tenantPath);
  process.exit(1);
}
const idBase = (file.id_base || "http://127.0.0.1:8091").replace(/\/+$/, "");
const apiBase = (file.api_base || "http://127.0.0.1:8088").replace(/\/+$/, "");
const secret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
if (!secret) {
  console.error("PLATFORM_BOOTSTRAP_SECRET required");
  process.exit(1);
}
const orgId = file.organization_id;
if (!orgId) {
  console.error("organization_id missing in tenant file");
  process.exit(1);
}

const put = await fetch(`${idBase}/v1/id/platform/organizations/${orgId}/members`, {
  method: "PUT",
  headers: {
    "content-type": "application/json",
    "x-platform-secret": secret,
  },
  body: JSON.stringify({
    email: fraud.email,
    role: "admin",
    display_name: fraud.display_name || "Fraud Analyst",
    password: fraud.password,
  }),
});
const putBody = await put.json().catch(() => ({}));
console.log("member", put.status, putBody);

// Login admin and assign bank roles via demo-tenant endpoint
const login = await fetch(`${idBase}/v1/id/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: file.personas.admin.email,
    password: file.personas.admin.password,
    organization_id: orgId,
  }),
});
const setCookies =
  typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [];
const cookie = setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("salanor_session="));
if (!cookie) {
  console.error("admin login failed", login.status, await login.text());
  process.exit(1);
}
const roles = await fetch(`${apiBase}/v1/console/demo-tenant/bank-roles`, {
  method: "POST",
  headers: { "content-type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    assignments: [{ email: fraud.email, role_key: "fraud_analyst" }],
  }),
});
console.log("bank-roles", roles.status, await roles.text());
