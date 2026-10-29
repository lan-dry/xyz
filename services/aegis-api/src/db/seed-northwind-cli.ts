/**
 * Phase 8: bulk historical traffic so Overview looks lived-in.
 * Local DB only. Default ~2.5k events over 90 days; set NORTHWIND_SEED_COUNT=40000 for full.
 *
 *   pnpm demo:seed:northwind
 */
import { randomUUID } from "node:crypto";
import { signEvent, type ApsEvent } from "@salanor/aegis";
import "./load-env.js";
import { assertLocalDatabaseUrl } from "./local-db-guard.js";
import {
  applyPilotDemoData,
  DEFAULT_PILOT_ORG_SLUG,
  DEFAULT_PILOT_SIGNING_PRIVATE_KEY_B64,
  PILOT_AGENT_ID,
  PILOT_KEY_ID,
  PILOT_PAYOUT_AGENT_ID,
  PILOT_PAYOUT_KEY_ID,
} from "./pilot-demo-data.js";
import { persistSignedEvent } from "../ingest/persist.js";
import { ensureDuplicatePayoutIncident } from "../repo/incidents.js";
import { closePool, getPool } from "./pool.js";

assertLocalDatabaseUrl();

const slug = process.env.PILOT_ORGANIZATION_SLUG?.trim() || DEFAULT_PILOT_ORG_SLUG;
const targetCount = Math.max(
  100,
  Number(process.env.NORTHWIND_SEED_COUNT ?? "2500") || 2500,
);
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() ||
  DEFAULT_PILOT_SIGNING_PRIVATE_KEY_B64;

const TOOLS = [
  "stripe.paymentIntents.create",
  "google.generativeai.classifyIntent",
  "google.generativeai.summarizeTicket",
  "aegis.trace.start",
  "aegis.agent.decision",
] as const;

const pool = getPool();
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const org = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1`,
    [slug],
  );
  let organizationId = org.rows[0]?.organization_id;
  if (!organizationId) {
    const created = await client.query<{ organization_id: string }>(
      `INSERT INTO organization (name, slug, onboarding_completed_at, active)
       VALUES ('Northwind Payments', $1, now(), true)
       RETURNING organization_id`,
      [slug],
    );
    organizationId = created.rows[0]!.organization_id;
  }
  await applyPilotDemoData(client, organizationId, slug);
  await client.query("COMMIT");

  const existing = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM event WHERE organization_id = $1`,
    [organizationId],
  );
  const have = Number(existing.rows[0]?.n ?? 0);
  const toAdd = Math.max(0, targetCount - have);
  console.log(
    `[seed-northwind] org=${slug} existing_events=${have} target=${targetCount} adding=${toAdd}`,
  );

  const agents = [
    { agentId: PILOT_AGENT_ID, keyId: PILOT_KEY_ID },
    { agentId: PILOT_PAYOUT_AGENT_ID, keyId: PILOT_PAYOUT_KEY_ID },
  ];

  const now = Date.now();
  const dayMs = 86_400_000;
  let approvals = 0;
  let denials = 0;

  for (let i = 0; i < toAdd; i++) {
    const agent = agents[i % agents.length]!;
    const tool = TOOLS[i % TOOLS.length]!;
    const daysAgo = (i % 90) + Math.random();
    const emittedAt = new Date(now - daysAgo * dayMs).toISOString();
    const decision =
      i % 47 === 0 ? "deny" : i % 23 === 0 ? "allow_with_obligation" : "allow";
    if (decision === "deny") denials += 1;

    const event: ApsEvent = {
      schema_version: 1,
      event_id: `evt_nw_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      organization_id: organizationId,
      trace_id: `trc_nw_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      agent_id: agent.agentId,
      key_id: agent.keyId,
      emitted_at: emittedAt,
      actor_type: "agent",
      actor_principal: agent.agentId,
      action_kind: "tool_call",
      tool_name: tool,
      policy_decision: decision,
      payload: {
        seed: true,
        amount_usd: 50 + (i % 400),
        request_payload: { amount_usd: 50 + (i % 400), segment: "standard" },
      },
    };

    const signed = await signEvent(event, {
      privateKeyB64,
      keyId: agent.keyId,
    });

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // Ensure trace exists for FK
      await c.query(
        `INSERT INTO trace (trace_id, organization_id, agent_id, status, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
         ON CONFLICT (trace_id) DO NOTHING`,
        [
          signed.trace_id,
          organizationId,
          agent.agentId,
          decision === "allow_with_obligation" ? "blocked" : "completed",
          emittedAt,
        ],
      );
      const persisted = await persistSignedEvent(c, signed, undefined);
      if (decision === "allow_with_obligation" && approvals < 12) {
        const approvalId = `apr_nw_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
        await c.query(
          `INSERT INTO approval (
             approval_id, event_id, organization_id, channel_type, token_hash,
             status, created_at, decided_at
           ) VALUES ($1, $2, $3, 'web_ui', $4, $5, $6::timestamptz, $7::timestamptz)`,
          [
            approvalId,
            persisted.eventId,
            organizationId,
            randomUUID().replace(/-/g, ""),
            i % 2 === 0 ? "approved" : "pending",
            emittedAt,
            i % 2 === 0 ? emittedAt : null,
          ],
        );
        approvals += 1;
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }

    if ((i + 1) % 250 === 0) {
      console.log(`[seed-northwind] … ${i + 1}/${toAdd}`);
    }
  }

  await ensureDuplicatePayoutIncident(pool, organizationId, "production");

  console.log(
    `[seed-northwind] done. approvals_seeded≈${approvals} denials_in_batch≈${denials}`,
  );
  console.log(
    `[seed-northwind] Open Console Overview for ${slug}; incident ensure=duplicate-payout available.`,
  );
} finally {
  client.release();
  await closePool();
}
