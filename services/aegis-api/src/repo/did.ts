import type pg from "pg";

export type DidDocumentRow = {
  did_document_id: string;
  agent_id: string;
  organization_id: string;
  document_json: Record<string, unknown>;
  published_at: Date;
};

export async function getDidDocumentByAgent(
  client: pg.Pool | pg.PoolClient,
  agentId: string,
): Promise<DidDocumentRow | null> {
  const result = await client.query<DidDocumentRow>(
    `SELECT did_document_id, agent_id, organization_id, document_json, published_at
     FROM did_document
     WHERE agent_id = $1
     ORDER BY published_at DESC
     LIMIT 1`,
    [agentId],
  );
  return result.rows[0] ?? null;
}

export async function getDidDocumentByDid(
  client: pg.Pool | pg.PoolClient,
  did: string,
): Promise<DidDocumentRow | null> {
  const result = await client.query<DidDocumentRow>(
    `SELECT d.did_document_id, d.agent_id, d.organization_id, d.document_json, d.published_at
     FROM did_document d
     JOIN agent a ON a.agent_id = d.agent_id
     WHERE a.did = $1
     ORDER BY d.published_at DESC
     LIMIT 1`,
    [did],
  );
  return result.rows[0] ?? null;
}
