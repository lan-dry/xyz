/**
 * Bank simulator back end (demo only).
 * Guarded by isDemoModeAllowed() AND an ingest Bearer key. The console's
 * Next.js server route holds that key; the browser never sees it.
 *
 *   GET  /v1/aegis/demo/simulator/stories
 *   POST /v1/aegis/demo/simulator/story   { story_id }
 *   POST /v1/aegis/demo/simulator/reset
 *
 * Stories use the real governed intake (handleBankEvent). Holds also open a
 * real approval request, exactly like the HTTP demo scenarios.
 */
import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { assertDemoMode, isDemoModeAllowed } from "../bank/demo-clock.js";
import { handleBankEvent } from "../bank/handle-event.js";
import { parseBankEvent } from "../bank/validate.js";
import {
  DEMO_BANK_REHEARSAL_SLUG,
  DEMO_BANK_SLUG,
  demoBankAgentIds,
} from "../db/demo-bank-fixture.js";
import { getPool } from "../db/pool.js";
import { grantApprovalDelegate } from "../bank/approval-delegate.js";
import { applyEscalateToRoleMetadata } from "../bank/console-approval-guard.js";
import {
  DEMO_APPROVAL_ACTORS,
  DEMO_DEPUTY_ACTOR,
  seedDemoDeputy,
} from "../demo/seed-approval-actors.js";
import { resetDemoOrganization } from "../demo/reset-org.js";
import { getSimulatorStory, SIMULATOR_STORIES } from "../demo/simulator-stories.js";
import { createApprovalRequest } from "../repo/approvals.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

type Guarded =
  | { ok: true; organizationId: string }
  | { ok: false; response: Response };

async function guard(c: Context): Promise<Guarded> {
  if (!isDemoModeAllowed()) {
    return {
      ok: false,
      response: c.json(
        {
          error: "demo_mode_required",
          message:
            "The simulator requires AEGIS_DEMO_MODE=true and is unavailable in production.",
        },
        403,
      ),
    };
  }
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return {
      ok: false,
      response: c.json({ error: "Missing or invalid Authorization" }, 401),
    };
  }
  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return { ok: false, response: c.json({ error: "Invalid API key" }, 401) };
    }
    return { ok: true, organizationId: auth.organizationId };
  } finally {
    client.release();
  }
}

export async function getSimulatorStories(c: Context): Promise<Response> {
  const g = await guard(c);
  if (!g.ok) return g.response;
  return c.json({
    demo: true,
    synthetic_data: true,
    stories: SIMULATOR_STORIES.map((s) => ({
      id: s.id,
      title: s.title,
      expect: s.expect,
      expect_detail: s.expect_detail,
      blurb: s.blurb,
      resolver: s.resolver ?? null,
      attributes: s.attributes,
      setup_kind: s.setup?.kind ?? null,
    })),
    // Emails are for sign-in only; screens show "name · role". Passwords are never
    // returned (AEGIS_DEMO_APPROVAL_PASSWORD).
    actors: [
      ...DEMO_APPROVAL_ACTORS.map((a) => ({
        email: a.email,
        display_name: a.display_name,
        bank_role: a.bank_role as string | null,
        note: null as string | null,
      })),
      {
        email: DEMO_DEPUTY_ACTOR.email,
        display_name: DEMO_DEPUTY_ACTOR.display_name,
        bank_role: null,
        note: "Deputy, acts as Credit Manager only while a delegation is valid",
      },
    ],
  });
}

export async function postSimulatorStory(c: Context): Promise<Response> {
  const g = await guard(c);
  if (!g.ok) return g.response;

  const body = (await c.req.json().catch(() => ({}))) as { story_id?: string };
  const story = body.story_id ? getSimulatorStory(body.story_id) : undefined;
  if (!story) {
    return c.json({ error: "unknown_story", message: "Unknown story_id" }, 404);
  }

  const pool = getPool();
  const org = await pool.query<{ slug: string }>(
    `SELECT slug FROM organization WHERE organization_id = $1`,
    [g.organizationId],
  );
  const slug = org.rows[0]?.slug ?? DEMO_BANK_SLUG;
  const caseId = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const steps: string[] = [];
  const setup = story.setup;

  // Unreachable-then-replayed: the event was emitted (and decided by the bank system's
  // fallback) before the outage ended; it is replayed to Aegis now.
  const replayedAt = new Date();
  const emittedAt =
    setup?.kind === "unreachable_replay"
      ? new Date(replayedAt.getTime() - setup.offline_minutes * 60_000)
      : replayedAt;
  const attributes: Record<string, unknown> = { ...story.attributes };
  if (setup?.kind === "unreachable_replay") {
    attributes.decided_without_aegis = true;
    attributes.fallback_decision = "proceed_and_flag";
    attributes.queued_at = emittedAt.toISOString();
    attributes.replayed_at = replayedAt.toISOString();
    steps.push(
      `Bank system lost contact with Aegis at ${emittedAt.toISOString()}.`,
      "It decided under its own fallback (proceed and flag) and queued the event.",
      `Contact returned ${setup.offline_minutes} minutes later; the queued event was replayed.`,
    );
  }

  const event = parseBankEvent({
    schema_version: 1,
    case_id: caseId,
    idempotency_key: `idem_sim_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    event_type: story.event_type,
    product: story.product,
    agent_id: demoBankAgentIds(slug, story.agent_suffix).agentId,
    emitted_at: emittedAt.toISOString(),
    attributes,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let decision;
    try {
      decision = await handleBankEvent(client, g.organizationId, event, {
        decidedWithoutAegis: setup?.kind === "unreachable_replay",
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const trace = await client.query<{ trace_id: string | null }>(
      `SELECT trace_id FROM bank_case WHERE organization_id = $1 AND case_id = $2`,
      [g.organizationId, caseId],
    );
    const traceId = trace.rows[0]?.trace_id ?? null;

    let approvalId: string | null = null;
    const sealed = Boolean(decision.event_id) && !decision.event_id!.startsWith("evt_gov_");
    // A hold needs a human; a hard stop needs a documented release by a named role.
    const needsApproval =
      decision.outcome === "hold" ||
      (decision.outcome === "stop" && setup?.kind === "hard_stop");
    let requiredRoles = decision.approval?.required_roles ?? [];
    if (needsApproval && sealed && traceId && decision.event_id) {
      const created = await createApprovalRequest(client, {
        organizationId: g.organizationId,
        eventId: decision.event_id,
        traceId,
        toolName: "governed.action",
        deferred: { url: "https://example.test/demo-callback", method: "POST" },
      });
      approvalId = created.approval_id;
      let metadata: Record<string, unknown> = {
        ...(requiredRoles[0]
          ? { required_role: requiredRoles[0], required_roles: requiredRoles }
          : {}),
        required_fields: ["reason_code", "comment"],
      };

      if (setup?.kind === "hard_stop") {
        requiredRoles = [setup.release_role];
        metadata = {
          ...metadata,
          hard_stop: true,
          release_requires_role: setup.release_role,
          required_role: setup.release_role,
          required_roles: requiredRoles,
        };
        steps.push(
          "Stopped by rule SANC-01 (sanctions / PEP hard stop). It cannot be approved.",
          "Only the Head of Compliance can release it, with a reason code and a comment.",
        );
      } else if (setup?.kind === "required_fields") {
        metadata = { ...metadata, required_fields: setup.fields };
        steps.push(
          `Held by rule PAY-03. Approve needs: ${setup.fields.join(", ")} (callback not verified).`,
          "Declining needs no callback check.",
        );
      } else if (setup?.kind === "escalate") {
        const limitMs = setup.after_minutes * 60_000;
        metadata = {
          ...metadata,
          escalate_to_role: setup.to_role,
          escalate_after_ms: limitMs,
          expires_after_ms: 1441 * 60_000,
        };
        // Simulated time: the approval sat past the limit, so it escalates now.
        metadata = applyEscalateToRoleMetadata(metadata, setup.to_role, {
          membership_id: "system",
          email: "system@demo",
        });
        requiredRoles = [setup.to_role];
        const h = Math.floor(setup.after_minutes / 60);
        const m = String(setup.after_minutes % 60).padStart(2, "0");
        steps.push(
          `Held for a Credit Manager with a 4-hour limit.`,
          `Nobody decided; ${h} h ${m} min passed (simulated). The approval escalated to Head of Compliance.`,
        );
      } else if (setup?.kind === "delegate") {
        const deputyMembershipId = await seedDemoDeputy(client, g.organizationId);
        const mgr = await client.query<{ membership_id: string }>(
          `SELECT m.membership_id
             FROM membership m JOIN account a ON a.account_id = m.account_id
            WHERE m.organization_id = $1 AND lower(a.email) = 'manager@demo.test'`,
          [g.organizationId],
        );
        const expiresAt =
          setup.window === "inside"
            ? new Date(Date.now() + 60 * 60_000)
            : new Date(Date.now() - 60_000);
        await grantApprovalDelegate(client, {
          organizationId: g.organizationId,
          membershipId: deputyMembershipId,
          roleKey: "credit_manager",
          expiresAt,
          grantedByMembershipId: mgr.rows[0]?.membership_id ?? null,
        });
        steps.push(
          `${DEMO_DEPUTY_ACTOR.display_name} holds a Credit Manager delegation from Jean Mutabazi.`,
          setup.window === "inside"
            ? "The delegation is valid for another 60 minutes, so approval is accepted."
            : "The delegation ended 1 minute ago, so approval is refused.",
        );
      }

      await client.query(
        `UPDATE approval
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE approval_id = $1 AND organization_id = $3`,
        [approvalId, JSON.stringify(metadata), g.organizationId],
      );
    }

    return c.json({
      ok: true,
      story_id: story.id,
      expected: story.expect,
      expect_detail: story.expect_detail,
      case_id: caseId,
      trace_id: traceId,
      outcome: decision.outcome,
      plain_summary: decision.plain_summary ?? null,
      matched_rules: decision.matched_rules,
      decided_by_rule_id: decision.decision_basis?.decided_by_rule_id ?? null,
      approval_id: approvalId,
      required_roles: requiredRoles,
      resolver: story.resolver ?? null,
      steps,
      decided_without_aegis: decision.flags?.decided_without_aegis === true,
      sealed,
    });
  } finally {
    client.release();
  }
}

export async function postSimulatorReset(c: Context): Promise<Response> {
  const g = await guard(c);
  if (!g.ok) return g.response;
  try {
    assertDemoMode("simulator reset");
  } catch (err) {
    return c.json(
      { error: "demo_mode_required", message: err instanceof Error ? err.message : "refused" },
      403,
    );
  }

  // Destructive: the caller must type RESET (the console asks for it).
  const resetBody = (await c.req.json().catch(() => ({}))) as { confirm?: string };
  if (resetBody.confirm !== "RESET") {
    return c.json(
      {
        error: "confirmation_required",
        message: 'Type RESET to confirm clearing the demo bank. Send {"confirm":"RESET"}.',
      },
      400,
    );
  }

  const pool = getPool();
  const org = await pool.query<{ slug: string }>(
    `SELECT slug FROM organization WHERE organization_id = $1`,
    [g.organizationId],
  );
  const slug = org.rows[0]?.slug;
  // Never wipe anything that is not the demo bank (or its rehearsal scratch org).
  if (slug !== DEMO_BANK_SLUG && slug !== DEMO_BANK_REHEARSAL_SLUG) {
    return c.json(
      {
        error: "not_demo_org",
        message: "Reset is only allowed for the demo bank organisation.",
      },
      403,
    );
  }

  const client = await pool.connect();
  try {
    // Keep the policy pack, roles and demo actors; clear cases, receipts, approvals.
    await resetDemoOrganization(client, g.organizationId, { keepPack: true });
  } finally {
    client.release();
  }
  return c.json({ ok: true, organization: slug });
}
