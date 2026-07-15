import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import type pg from "pg";

export type AgentCredentials = {
  agent_id: string;
  key_id: string;
  organization_id: string;
  organization_slug: string;
  public_key_b64: string;
  /** Shown once at creation — never stored server-side. */
  private_key_b64: string;
  did: string;
};

export type AgentRow = {
  agent_id: string;
  organization_id: string;
  slug: string;
  display_name: string | null;
  did: string;
  active: boolean;
  created_at: Date;
};

export type SigningKeySummary = {
  key_id: string;
  agent_id: string;
  public_key_b64: string;
  kms_provider: string | null;
  revoked: boolean;
  valid_from: Date;
  created_at: Date;
};

export async function generateEd25519KeyPair(): Promise<{
  publicKeyB64: string;
  privateKeyB64: string;
}> {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
  };
}

function buildDidDocument(input: {
  did: string;
  agentId: string;
  publicKeyB64: string;
  organizationSlug: string;
}): Record<string, unknown> {
  const verificationMethodId = `${input.did}#key-1`;
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: input.did,
    controller: input.did,
    alsoKnownAs: [input.agentId],
    verificationMethod: [
      {
        id: verificationMethodId,
        type: "Ed25519VerificationKey2020",
        controller: input.did,
        publicKeyBase64: input.publicKeyB64,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    service: [
      {
        id: `${input.did}#aegis`,
        type: "AegisWitness",
        serviceEndpoint: `/v1/public/orgs/${input.organizationSlug}/verify`,
      },
    ],
  };
}

/**
 * Register an agent + active Ed25519 signing key for an organization.
 * Industry pattern: platform generates key pair; private key returned once (BYOK later).
 */
export async function createAgentWithSigningKey(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    organizationSlug: string;
    slug?: string;
    displayName?: string;
    auditActorId?: string | null;
  },
): Promise<AgentCredentials> {
  const slug = (input.slug ?? "default").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const displayName = input.displayName?.trim() || "Default agent";
  const agentId = `agt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const keyId = `key_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { publicKeyB64, privateKeyB64 } = await generateEd25519KeyPair();
  const did = `did:salanor:${input.organizationSlug}:${agentId}`;

  await client.query(
    `INSERT INTO agent (agent_id, organization_id, did, slug, display_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, input.organizationId, did, slug, displayName],
  );

  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, public_key_b64, valid_from
     )
     VALUES ($1, $2, $3, 'dev', $4, now())`,
    [keyId, agentId, input.organizationId, publicKeyB64],
  );

  await client.query(
    `INSERT INTO did_document (agent_id, organization_id, document_json)
     VALUES ($1, $2, $3::jsonb)`,
    [agentId, input.organizationId, JSON.stringify(
      buildDidDocument({
        did,
        agentId,
        publicKeyB64,
        organizationSlug: input.organizationSlug,
      }),
    )],
  );

  if (input.auditActorId !== undefined) {
    await client.query(
      `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'agent.created', 'agent', $3, $4::jsonb)`,
      [
        input.organizationId,
        input.auditActorId,
        agentId,
        JSON.stringify({ agent_id: agentId, key_id: keyId, slug }),
      ],
    );
  }

  return {
    agent_id: agentId,
    key_id: keyId,
    organization_id: input.organizationId,
    organization_slug: input.organizationSlug,
    public_key_b64: publicKeyB64,
    private_key_b64: privateKeyB64,
    did,
  };
}

export async function listAgentsForOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<
  (AgentRow & {
    signing_keys: SigningKeySummary[];
  })[]
> {
  const agents = await client.query<AgentRow>(
    `SELECT agent_id, organization_id, slug, display_name, did, active, created_at
     FROM agent
     WHERE organization_id = $1
     ORDER BY created_at ASC`,
    [organizationId],
  );

  const keys = await client.query<SigningKeySummary>(
    `SELECT key_id, agent_id, public_key_b64, kms_provider, revoked, valid_from, created_at
     FROM signing_key
     WHERE organization_id = $1
     ORDER BY created_at ASC`,
    [organizationId],
  );

  const keysByAgent = new Map<string, SigningKeySummary[]>();
  for (const key of keys.rows) {
    const list = keysByAgent.get(key.agent_id) ?? [];
    list.push(key);
    keysByAgent.set(key.agent_id, list);
  }

  return agents.rows.map((agent) => ({
    ...agent,
    signing_keys: keysByAgent.get(agent.agent_id) ?? [],
  }));
}

export async function getOrganizationSlug(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string | null> {
  const result = await client.query<{ slug: string }>(
    `SELECT slug FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows[0]?.slug ?? null;
}
