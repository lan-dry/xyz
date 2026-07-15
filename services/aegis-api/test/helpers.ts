import type pg from "pg";

export const ORG_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const ORG_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export async function insertOrganization(
  client: pg.PoolClient,
  organizationId: string,
  slug: string,
): Promise<void> {
  await client.query(
    `INSERT INTO organization (organization_id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING`,
    [organizationId, `Org ${slug}`, slug],
  );
}

export async function insertAgent(
  client: pg.PoolClient,
  agentId: string,
  organizationId: string,
  slug: string,
): Promise<void> {
  await client.query(
    `INSERT INTO agent (agent_id, organization_id, did, slug)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId, organizationId, `did:salanor:test:${agentId}`, slug],
  );
}

export async function insertSigningKey(
  client: pg.PoolClient,
  keyId: string,
  agentId: string,
  organizationId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, public_key_b64, valid_from
     ) VALUES ($1, $2, $3, 'dev', 'dGVzdA==', now())
     ON CONFLICT (key_id) DO NOTHING`,
    [keyId, agentId, organizationId],
  );
}

export async function insertTrace(
  client: pg.PoolClient,
  traceId: string,
  organizationId: string,
  agentId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO trace (trace_id, organization_id, agent_id, started_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (trace_id) DO NOTHING`,
    [traceId, organizationId, agentId],
  );
}

export async function insertEvent(
  client: pg.PoolClient,
  params: {
    eventId: string;
    organizationId: string;
    traceId: string;
    agentId: string;
    keyId: string;
    sequenceNum: number;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO event (
       event_id,
       organization_id,
       trace_id,
       agent_id,
       key_id,
       sequence_num,
       event_hash,
       actor_type,
       actor_principal,
       action_kind,
       policy_decision,
       sig_value_b64,
       emitted_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, 'agent', 'test-principal', 'tool_call', 'allow', 'c2ln', now()
     )
     ON CONFLICT (event_id) DO NOTHING`,
    [
      params.eventId,
      params.organizationId,
      params.traceId,
      params.agentId,
      params.keyId,
      params.sequenceNum,
      `hash-${params.eventId}`,
    ],
  );
}

export async function cleanupIsolationFixtures(
  client: pg.PoolClient,
): Promise<void> {
  await client.query(`DELETE FROM event WHERE event_id LIKE 'evt-test-%'`);
  await client.query(`DELETE FROM trace WHERE trace_id LIKE 'trace-test-%'`);
  await client.query(`DELETE FROM signing_key WHERE key_id LIKE 'key-test-%'`);
  await client.query(`DELETE FROM agent WHERE agent_id LIKE 'agent-test-%'`);
  await client.query(
    `DELETE FROM organization WHERE organization_id IN ($1, $2)`,
    [ORG_A_ID, ORG_B_ID],
  );
}
