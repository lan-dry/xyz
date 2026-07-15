import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { getInclusionProofByEvent } from "../../repo/witness.js";
import {
  verifyEventFull,
  type EventRowForVerify,
} from "../../witness/verify-event.js";

export const verifyRoutes = new Hono<{ Variables: ConsoleVariables }>();

verifyRoutes.get(
  "/events/:eventId/verify",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const eventId = c.req.param("eventId");
    if (!eventId) {
      return c.json({ error: "eventId required" }, 422);
    }

    const client = await getPool().connect();
    try {
      const result = await client.query<EventRowForVerify>(
        `SELECT
           e.schema_version,
           e.event_id,
           e.organization_id,
           e.trace_id,
           e.parent_event_id,
           e.agent_id,
           e.key_id,
           e.policy_id,
           e.sequence_num,
           e.prev_event_hash,
           e.event_hash,
           e.actor_type,
           e.actor_principal,
           e.action_kind,
           e.tool_name,
           e.args_hash,
           e.args_redacted,
           e.policy_decision,
           e.policy_obligations,
           e.result_status,
           e.output_hash,
           e.sig_alg,
           e.sig_value_b64,
           e.chain_valid,
           e.payload,
           e.emitted_at,
           sk.public_key_b64
         FROM event e
         JOIN signing_key sk ON sk.key_id = e.key_id
         WHERE e.organization_id = $1 AND e.event_id = $2`,
        [orgId, eventId],
      );
      const row = result.rows[0];
      if (!row) {
        return c.json({ error: "Not found" }, 404);
      }

      const verification = await verifyEventFull(client, row);
      const proof = await getInclusionProofByEvent(client, orgId, eventId);

      return c.json({
        verification,
        inclusion_proof: proof
          ? {
              proof_id: proof.proof_id,
              root_id: proof.root_id,
              root_hash: proof.root_hash,
              leaf_index: proof.leaf_index,
            }
          : null,
      });
    } finally {
      client.release();
    }
  },
);
