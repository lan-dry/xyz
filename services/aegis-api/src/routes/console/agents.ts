import { Hono } from "hono";
import {
  createAgentWithSigningKey,
  getOrganizationSlug,
  listAgentsForOrganization,
  type AgentRow,
  type SigningKeySummary,
} from "@salanor/platform-auth";

type AgentWithKeys = AgentRow & { signing_keys: SigningKeySummary[] };
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const agentRoutes = new Hono<{ Variables: ConsoleVariables }>();

agentRoutes.get("/agents", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const client = await getPool().connect();
  try {
    const agents = await listAgentsForOrganization(client, orgId);
    return c.json({
      agents: agents.map((a: AgentWithKeys) => ({
        agent_id: a.agent_id,
        slug: a.slug,
        display_name: a.display_name,
        did: a.did,
        active: a.active,
        created_at: a.created_at.toISOString(),
        signing_keys: a.signing_keys.map((k: SigningKeySummary) => ({
          key_id: k.key_id,
          public_key_b64: k.public_key_b64,
          kms_provider: k.kms_provider,
          revoked: k.revoked,
          valid_from: k.valid_from.toISOString(),
          created_at: k.created_at.toISOString(),
        })),
      })),
    });
  } finally {
    client.release();
  }
});

agentRoutes.post("/agents", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { display_name?: string; slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const client = await getPool().connect();
  try {
    const orgSlug = await getOrganizationSlug(client, session.organizationId);
    if (!orgSlug) {
      return c.json({ error: "Organization not found" }, 404);
    }

    const credentials = await createAgentWithSigningKey(client, {
      organizationId: session.organizationId,
      organizationSlug: orgSlug,
      slug: body.slug,
      displayName: body.display_name,
      auditActorId: session.userId,
    });

    return c.json(
      {
        agent: {
          agent_id: credentials.agent_id,
          key_id: credentials.key_id,
          slug: body.slug ?? "default",
          display_name: body.display_name ?? "Default agent",
          did: credentials.did,
          organization_id: credentials.organization_id,
        },
        credentials: {
          agent_id: credentials.agent_id,
          key_id: credentials.key_id,
          organization_id: credentials.organization_id,
          organization_slug: credentials.organization_slug,
          private_key_b64: credentials.private_key_b64,
          public_key_b64: credentials.public_key_b64,
        },
        message:
          "Copy the private key now. It cannot be retrieved again. Store it in your secrets manager.",
      },
      201,
    );
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return c.json({ error: "Agent slug already exists in this organization" }, 409);
    }
    console.error("[console] create agent", err);
    return c.json({ error: "Failed to create agent" }, 500);
  } finally {
    client.release();
  }
});
