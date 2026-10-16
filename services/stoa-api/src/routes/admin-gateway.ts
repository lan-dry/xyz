import { Hono } from "hono";
import {
  adminAccessForbidden,
  loadAdminAccess,
  requireOrgRead,
  requireOrgWrite,
} from "../auth/admin-access.js";
import {
  createGatewayCredential,
  listGatewayCredentials,
  revokeGatewayCredential,
} from "../gateway/credentials.js";
import { getPool } from "../db/pool.js";

export const adminGatewayRoutes = new Hono();

adminGatewayRoutes.use("*", async (c, next) => {
  await loadAdminAccess(c);
  await next();
});

adminGatewayRoutes.get("/gateway/credentials", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const credentials = await listGatewayCredentials(tenantId);
  const base =
    process.env.STOA_API_PUBLIC_URL?.trim() || new URL(c.req.url).origin;
  return c.json({
    credentials,
    endpoint: new URL("/v1/chat/completions", base).toString(),
  });
});

adminGatewayRoutes.post("/gateway/credentials", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const name = body.name?.trim();
  if (!name || name.length > 80) {
    return c.json({ error: "Enter a name (up to 80 characters)." }, 422);
  }
  const created = await createGatewayCredential({
    tenantId,
    name,
    createdByUserId: userId,
  });
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.gateway.credential_created', $3::jsonb)`,
    [
      tenantId,
      userId,
      JSON.stringify({
        credentialId: created.credential.id,
        name: created.credential.name,
        keyPrefix: created.credential.keyPrefix,
      }),
    ],
  );
  return c.json({
    credential: created.credential,
    api_key: created.apiKey,
    message: "Copy the API key now. It will not be shown again.",
  });
});

adminGatewayRoutes.delete("/gateway/credentials/:credentialId", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const credentialId = c.req.param("credentialId");
  const ok = await revokeGatewayCredential(tenantId, credentialId);
  if (!ok) {
    return c.json({ error: "Key not found." }, 404);
  }
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.gateway.credential_revoked', $3::jsonb)`,
    [tenantId, userId, JSON.stringify({ credentialId })],
  );
  return c.json({ ok: true });
});
