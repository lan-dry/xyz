/**
 * Run: node examples/quickstart.mjs
 * Env: AEGIS_ORG_ID, AEGIS_AGENT_ID, AEGIS_KEY_ID, AEGIS_SIGNING_PRIVATE_KEY_B64,
 *      AEGIS_INGEST_API_KEY, optional AEGIS_INGEST_URL
 */
import { randomUUID } from "node:crypto";
import { signAndIngest } from "@salanor/aegis";

const ingestUrl =
  process.env.AEGIS_INGEST_URL ?? "http://127.0.0.1:8080/v1/aegis/events";

const event = {
  schema_version: 1,
  event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  organization_id: process.env.AEGIS_ORG_ID,
  trace_id: `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  agent_id: process.env.AEGIS_AGENT_ID,
  key_id: process.env.AEGIS_KEY_ID,
  emitted_at: new Date().toISOString(),
  actor_type: "agent",
  actor_principal: "quickstart",
  action_kind: "tool_call",
  policy_decision: "allow",
  payload: { hello: "aps-1" },
};

const result = await signAndIngest(event, ingestUrl, {
  privateKeyB64: process.env.AEGIS_SIGNING_PRIVATE_KEY_B64,
  keyId: process.env.AEGIS_KEY_ID,
  bearer: process.env.AEGIS_INGEST_API_KEY,
});

console.log(JSON.stringify(result, null, 2));
