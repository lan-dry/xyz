import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import { getDidDocumentByAgent, getDidDocumentByDid } from "../../repo/did.js";
import { buildPublicVerificationBundle } from "../../transparency/bundle.js";
import { verifyPublicVerificationBundle } from "../../transparency/verify-public.js";

export const publicRoutes = new Hono();

publicRoutes.get("/orgs/:slug/transparency/head", async (c) => {
  const slug = c.req.param("slug");
  const client = await getPool().connect();
  try {
    const org = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM organization WHERE slug = $1`,
      [slug],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) {
      return c.json({ error: "Not found" }, 404);
    }

    const head = await client.query<{
      tree_size: string;
      latest_log_index: string | null;
      latest_leaf_hash: string | null;
      latest_published_at: Date | null;
    }>(
      `SELECT
         COUNT(*)::text AS tree_size,
         MAX(log_index)::text AS latest_log_index,
         (SELECT leaf_hash FROM transparency_log_entry t2
          WHERE t2.organization_id = $1
          ORDER BY log_index DESC LIMIT 1) AS latest_leaf_hash,
         MAX(published_at) AS latest_published_at
       FROM transparency_log_entry
       WHERE organization_id = $1`,
      [organizationId],
    );

    const row = head.rows[0];
    return c.json({
      organization_slug: slug,
      tree_size: Number(row?.tree_size ?? 0),
      latest_log_index:
        row?.latest_log_index != null ? Number(row.latest_log_index) : null,
      latest_leaf_hash: row?.latest_leaf_hash ?? null,
      latest_published_at: row?.latest_published_at ?? null,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/orgs/:slug/verify/:eventId", async (c) => {
  const slug = c.req.param("slug");
  const eventId = c.req.param("eventId");
  const client = await getPool().connect();
  try {
    const bundle = await buildPublicVerificationBundle(client, slug, eventId);
    if (!bundle) {
      return c.json({ error: "Not found" }, 404);
    }
    const includeVerification =
      c.req.query("verify") === "1" || c.req.query("include") === "verification";
    if (includeVerification) {
      return c.json({
        ...bundle,
        verification: verifyPublicVerificationBundle(bundle),
      });
    }
    return c.json(bundle);
  } finally {
    client.release();
  }
});

publicRoutes.get("/agents/:agentId/did", async (c) => {
  const agentId = c.req.param("agentId");
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByAgent(client, agentId);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      agent_id: doc.agent_id,
      organization_id: doc.organization_id,
      document: doc.document_json,
      published_at: doc.published_at,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/did/:did", async (c) => {
  const did = decodeURIComponent(c.req.param("did"));
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByDid(client, did);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(doc.document_json);
  } finally {
    client.release();
  }
});
