import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { getInclusionProofByEvent } from "../repo/witness.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getEventInclusionProof(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const eventId = c.req.param("eventId");
  if (!eventId) {
    return c.json({ error: "eventId required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const proof = await getInclusionProofByEvent(
      client,
      auth.organizationId,
      eventId,
    );
    if (!proof) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({
      proof_id: proof.proof_id,
      event_id: proof.event_id,
      root_id: proof.root_id,
      root_hash: proof.root_hash,
      tree_size: proof.tree_size,
      leaf_index: proof.leaf_index,
      merkle_path: proof.merkle_path,
    });
  } finally {
    client.release();
  }
}
