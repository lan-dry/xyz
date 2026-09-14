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
import { enableWorkflowBridgeForAgent } from "../../workflows/bridge.js";
import {
  registerByokSigningKey,
} from "../../repo/signing-keys.js";
import { validateEd25519PublicKey } from "../../crypto/signing-provider.js";

export const agentRoutes = new Hono<{ Variables: ConsoleVariables }>();

agentRoutes.get("/agents", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const client = await getPool().connect();
  try {
    const agents = await listAgentsForOrganization(client, orgId);

    // Direct DB check — stale platform-auth builds omitted bridge_enabled in SELECT,
    // so the Console never flipped from "Enable" to "on" after a successful enable.
    const bridgeRows = await client.query<{ agent_id: string; key_id: string }>(
      `SELECT agent_id, key_id
       FROM signing_key
       WHERE organization_id = $1
         AND bridge_enabled = true
         AND revoked = false
         AND private_key_ciphertext IS NOT NULL`,
      [orgId],
    );
    const bridgeKeyIds = new Set(bridgeRows.rows.map((r) => r.key_id));
    const bridgeAgentIds = new Set(bridgeRows.rows.map((r) => r.agent_id));

    return c.json({
      agents: agents.map((a: AgentWithKeys) => {
        const signing_keys = a.signing_keys.map((k: SigningKeySummary) => ({
          key_id: k.key_id,
          public_key_b64: k.public_key_b64,
          kms_provider: k.kms_provider,
          revoked: k.revoked,
          bridge_enabled: Boolean(k.bridge_enabled) || bridgeKeyIds.has(k.key_id),
          valid_from: k.valid_from.toISOString(),
          created_at: k.created_at.toISOString(),
        }));
        return {
          agent_id: a.agent_id,
          slug: a.slug,
          display_name: a.display_name,
          did: a.did,
          active: a.active,
          created_at: a.created_at.toISOString(),
          workflow_bridge_enabled: bridgeAgentIds.has(a.agent_id),
          signing_keys,
        };
      }),
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

/** Register a customer-held Ed25519 public key (BYOK — private key never sent to Salanor). */
agentRoutes.post("/agents/:agentId/keys/byok", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const agentId = c.req.param("agentId");
  if (!agentId) {
    return c.json({ error: "agentId required" }, 422);
  }

  let body: {
    public_key_b64?: string;
    kms_provider?: "customer" | "aws" | "gcp" | "vault";
    kms_key_arn?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const publicKey = body.public_key_b64?.trim();
  if (!publicKey) {
    return c.json({ error: "public_key_b64 required" }, 422);
  }

  try {
    validateEd25519PublicKey(publicKey);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid public key" }, 422);
  }

  const kmsProvider = body.kms_provider ?? "customer";
  if ((kmsProvider === "aws" || kmsProvider === "gcp" || kmsProvider === "vault") && !body.kms_key_arn?.trim()) {
    return c.json({ error: "kms_key_arn required for aws/gcp/vault providers" }, 422);
  }

  const client = await getPool().connect();
  try {
    const agentCheck = await client.query<{ agent_id: string }>(
      `SELECT agent_id FROM agent WHERE organization_id = $1 AND agent_id = $2`,
      [session.organizationId, agentId],
    );
    if (!agentCheck.rows[0]) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const created = await registerByokSigningKey(client, {
      organizationId: session.organizationId,
      agentId,
      publicKeyB64: publicKey,
      kmsProvider,
      kmsKeyArn: body.kms_key_arn?.trim() ?? null,
    });

    return c.json(
      {
        key_id: created.key_id,
        kms_provider: kmsProvider,
        message:
          "BYOK key registered. Sign events with your private key or KMS; Salanor stores and verifies the public key only.",
      },
      201,
    );
  } finally {
    client.release();
  }
});

agentRoutes.post("/agents/:agentId/workflow-bridge", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const agentId = c.req.param("agentId");
  if (!agentId) {
    return c.json({ error: "agentId required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const orgSlug = await getOrganizationSlug(client, session.organizationId);
    if (!orgSlug) {
      return c.json({ error: "Organization not found" }, 404);
    }

    const enabled = await enableWorkflowBridgeForAgent(client, {
      organizationId: session.organizationId,
      organizationSlug: orgSlug,
      agentId,
    });

    return c.json(
      {
        ...enabled,
        message: enabled.already_enabled
          ? "Workflow Bridge is already on. Customers: n8n → Settings → Community nodes → install n8n-nodes-salanor-aegis → Salanor Aegis (Record Run / Check Policy)."
          : "Workflow Bridge enabled. Customers: n8n → Settings → Community nodes → install n8n-nodes-salanor-aegis → Salanor Aegis (Record Run at end; Check Policy before risk).",
      },
      enabled.already_enabled ? 200 : 201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enable Workflow Bridge";
    const status = message.includes("not configured")
      ? 503
      : message.includes("not found")
        ? 404
        : 500;
    return c.json({ error: message }, status);
  } finally {
    client.release();
  }
});
