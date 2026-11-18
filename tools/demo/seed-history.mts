/**
 * pnpm pilot:seed-history
 *
 * Gives the hosted Demo Bank a believable history: 11 cases sent through the REAL
 * governed intake (ingest key), with holds requested through the real approvals
 * endpoint and decided by the personas' own console sessions. Intake emitted_at
 * and sealed issued_at values are staggered across ~45 prior days; approvals use
 * a historical decided_at hours after each hold (demo org only).
 *
 * Idempotent: case ids and idempotency keys are fixed, so a re-run re-sends nothing new
 * and decides only approvals that are still pending.
 *
 * Stories come from tools/demo/demo-bank-history.example.json (synthetic, committed), or the JSON
 * file named by DEMO_HISTORY_FILE. Real emails stay in .demo-tenant-emails.local.json only.
 *
 * Needs:
 *   AEGIS_INGEST_KEY   (or DEMO_BANK_INGEST_KEY, the stable key) printed once by
 *                      pilot:provision-demo-tenant when no stable key is configured
 * and .demo-tenant-emails.local.json with a password for the manager and the head
 * (a case whose decider has no password is left pending, and reported).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ConsoleSession,
  HttpError,
  fail,
  httpJson,
  loadTenantFile,
  type PersonaKey,
  type TenantFile,
} from "./demo-tenant-lib.mts";

type Story = {
  n: string;
  event_type: string;
  product: string;
  agent: "credit-decision" | "payments-gateway" | "customer-data" | "core-banking";
  attributes: Record<string, unknown>;
  /** Who decides a hold, and how. Omitted: nothing to decide (allow, or a final stop). */
  decide?: { by: PersonaKey; decision: "approve" | "decline"; reason: string; reason_code?: string };
};

/** Resolved at run time, after .env has been loaded (DEMO_HISTORY_FILE may live there). */
const historyFile = (): string => {
  if (process.env.DEMO_HISTORY_FILE?.trim()) {
    return resolve(process.env.DEMO_HISTORY_FILE.trim());
  }
  // Source tree: tools/demo/*.mts; compiled: tools/demo/dist/*.js
  const beside = resolve(import.meta.dirname, "demo-bank-history.example.json");
  if (existsSync(beside)) return beside;
  return resolve(import.meta.dirname, "../demo-bank-history.example.json");
};

/** Synthetic story data comes from JSON (committed example): never from code, never real emails. */
function loadStories(): Story[] {
  const path = historyFile();
  if (!existsSync(path)) fail(`History file not found: ${path}`);
  let raw = readFileSync(path, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let parsed: { stories?: Story[] };
  try {
    parsed = JSON.parse(raw) as { stories?: Story[] };
  } catch {
    fail(`${path} is not valid JSON.`);
  }
  const stories = parsed.stories;
  if (!Array.isArray(stories) || stories.length === 0) {
    fail(`${path}: 'stories' must be a non-empty array.`);
  }
  const seen = new Set<string>();
  for (const s of stories) {
    if (!s?.n || !s.event_type || !s.product || !s.agent || typeof s.attributes !== "object") {
      fail(`${path}: every story needs n, event_type, product, agent and attributes.`);
    }
    if (seen.has(s.n)) fail(`${path}: duplicate story n=${s.n}.`);
    seen.add(s.n);
  }
  return stories;
}

type Decision = {
  outcome: string;
  event_id: string | null;
  flags?: { provisional?: boolean };
};

type ApprovalRow = { approval_id: string; trace_id: string; status?: string };

const log = (msg: string) => console.log(`  ${msg}`);

function ingestKey(): string {
  const key = process.env.AEGIS_INGEST_KEY?.trim() || process.env.DEMO_BANK_INGEST_KEY?.trim();
  if (!key) {
    fail(
      "AEGIS_INGEST_KEY (or DEMO_BANK_INGEST_KEY) is not set. Use the stable DEMO_BANK_INGEST_KEY you gave\n  pilot:provision-demo-tenant, or the key it printed once (re-run it with --new-ingest-key for a fresh one).",
    );
  }
  return key;
}

async function findApproval(
  admin: ConsoleSession,
  traceId: string,
  eventId?: string,
): Promise<{ row: ApprovalRow; pending: boolean } | null> {
  const match = (a: ApprovalRow & { event_id?: string }) =>
    a.trace_id === traceId || (eventId != null && a.event_id === eventId);
  const pending = await admin.call<{ approvals: Array<ApprovalRow & { event_id?: string }> }>(
    "/approvals?status=pending",
  );
  const p = pending.data.approvals.find(match);
  if (p) return { row: p, pending: true };
  const history = await admin.call<{ approvals: Array<ApprovalRow & { event_id?: string }> }>(
    "/approvals?status=history&limit=100",
  );
  const h = history.data.approvals.find(match);
  return h ? { row: h, pending: false } : null;
}

async function requestApproval(
  file: TenantFile,
  key: string,
  organizationId: string,
  eventId: string,
  traceId: string,
): Promise<string> {
  const res = await httpJson<{ approval_id?: string; error?: string }>(
    `${file.api_base}/v1/aegis/approvals/request`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: {
        organization_id: organizationId,
        event_id: eventId,
        trace_id: traceId,
        tool_name: "governed.action",
        deferred: { url: "https://example.test/demo-callback", method: "POST" },
      },
    },
  );
  if (res.status >= 300 || !res.data.approval_id) {
    throw new HttpError(res.status, "approvals/request", res.data);
  }
  return res.data.approval_id;
}

async function main(): Promise<void> {
  const file = loadTenantFile(); // also loads .env
  const STORIES = loadStories();
  const key = ingestKey();
  console.log(`Seeding Demo Bank history on ${file.api_base}`);

  const admin = await ConsoleSession.loginResolved(file, file.personas.admin);
  const organizationId = admin.organizationId;
  const profile = await admin.call<{ organization: { is_demo: boolean } }>("/organization/profile");
  if (profile.data.organization.is_demo !== true) {
    fail("Refusing to seed: this organisation is not flagged is_demo.");
  }

  const agents = await admin.call<{ agents: Array<{ agent_id: string; slug: string }> }>("/agents");
  const agentId = (slug: string) => agents.data.agents.find((a) => a.slug === slug)?.agent_id;

  // Persona sessions are opened lazily and only for people who decide something.
  const sessions = new Map<PersonaKey, ConsoleSession | null>();
  async function sessionFor(who: PersonaKey): Promise<ConsoleSession | null> {
    if (sessions.has(who)) return sessions.get(who) ?? null;
    const persona = file.personas[who];
    if (!persona.password) {
      sessions.set(who, null);
      return null;
    }
    const s = await ConsoleSession.login(file, organizationId, persona).catch(() => null);
    sessions.set(who, s);
    return s;
  }

  const summary: Array<{ n: string; outcome: string; result: string; trace: string }> = [];

  /** Production-like bank references (no seedhist / DB-HIST / tr_seedhist). */
  function caseTraceIds(story: Story): { caseId: string; traceId: string; idem: string } {
    const num = Number(story.n);
    const year = 2026;
    let prefix = "LN-RW";
    let base = 400;
    if (story.event_type === "payment_transfer") {
      prefix = "PAY-RW";
      base = 800;
    } else if (story.event_type === "data_access") {
      prefix = "CD-RW";
      base = 200;
    }
    const ref = String(base + (Number.isFinite(num) ? num : 0)).padStart(5, "0");
    return {
      caseId: `${prefix}-${year}-${ref}`,
      traceId: `TR-RW-${year}-${ref}`,
      idem: `${prefix.toLowerCase()}-history-${year}-${ref}-v4`,
    };
  }

  /**
   * Spread intake across ~45 days of business hours. Newest story is still ≥2 days
   * ago so an approval hours later stays in the past (API refuses future decided_at).
   */
  function emittedAtForIndex(index: number, total: number): string {
    const oldestMs = 45 * 24 * 60 * 60 * 1000;
    const newestMs = 2 * 24 * 60 * 60 * 1000;
    const frac = (total - 1 - index) / Math.max(total - 1, 1);
    const offset = newestMs + (oldestMs - newestMs) * frac;
    const d = new Date(Date.now() - offset);
    d.setUTCHours(7 + (index % 7), 10 + ((index * 11) % 45), 20 + (index % 30), 0);
    return d.toISOString();
  }

  /**
   * Approval / decline wall time: hours after the hold (same case), never the same
   * second, and never in the future.
   */
  function decidedAtAfterHold(holdAt: string, index: number): string {
    const hold = new Date(holdAt).getTime();
    const hoursLater = 2 + ((index * 5) % 28); // 2–29h
    const minutesExtra = 15 + ((index * 13) % 40);
    let t = hold + (hoursLater * 60 + minutesExtra) * 60_000;
    const maxT = Date.now() - 60_000;
    if (t > maxT) {
      const room = maxT - hold;
      t =
        room > 30 * 60_000
          ? hold + Math.min(room - 60_000, (3 * 60 + 20) * 60_000)
          : hold + Math.max(5 * 60_000, Math.floor(Math.max(room, 0) / 2));
    }
    if (t <= hold) t = hold + 15 * 60_000;
    const d = new Date(t);
    if (d.getUTCHours() < 7) d.setUTCHours(8 + (index % 3), 15 + (index % 30), 0, 0);
    if (d.getUTCHours() > 17) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(8 + (index % 4), 20 + ((index * 7) % 35), 0, 0);
    }
    if (d.getTime() <= hold) d.setTime(hold + 15 * 60_000);
    if (d.getTime() > maxT) d.setTime(Math.max(hold + 15 * 60_000, maxT));
    return d.toISOString();
  }

  for (let i = 0; i < STORIES.length; i++) {
    const story = STORIES[i]!;
    const { caseId, traceId, idem } = caseTraceIds(story);
    const emittedAt = emittedAtForIndex(i, STORIES.length);
    const decidedAt = decidedAtAfterHold(emittedAt, i);

    const intake = await httpJson<Decision & { error?: string }>(
      `${file.api_base}/v1/aegis/governed/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Idempotency-Key": idem },
        body: {
          schema_version: 1,
          case_id: caseId,
          idempotency_key: idem,
          event_type: story.event_type,
          product: story.product,
          agent_id: agentId(story.agent),
          emitted_at: emittedAt,
          actor: { type: "system", id: story.agent },
          // demo_history stays out of signed attributes; UI badges use case_id pattern.
          attributes: { ...story.attributes },
          trace_id: traceId,
        },
      },
    );
    if (intake.status !== 200) throw new HttpError(intake.status, "governed/events", intake.data);
    const decision = intake.data;
    const outcome = decision.outcome;
    let result = outcome === "allow" ? "allowed" : outcome === "stop" ? "stopped (hard stop)" : "held";

    if (outcome === "hold" && story.decide) {
      const eventId = decision.event_id;
      if (!eventId || eventId.startsWith("evt_gov_")) {
        result = "held, NOT sealed (signing bridge missing: set AEGIS_BRIDGE_MASTER_KEY and re-run)";
      } else {
        let found = await findApproval(admin, traceId, eventId);
        const decisionApprovalId = (decision as unknown as { approval_id?: string }).approval_id;
        if (!found && typeof decisionApprovalId === "string") {
          found = {
            row: {
              approval_id: decisionApprovalId,
              trace_id: traceId,
            },
            pending: true,
          };
        }
        if (!found) {
          const approvalId = await requestApproval(file, key, organizationId, eventId, traceId);
          found = { row: { approval_id: approvalId, trace_id: traceId }, pending: true };
        }
        if (!found.pending) {
          result = "already decided";
        } else {
          const attempts: PersonaKey[] =
            story.decide.by === "head" ? ["head"] : [story.decide.by, "head"];
          let done = false;
          for (const who of attempts) {
            const s = await sessionFor(who);
            if (!s) continue;
            const path = `/approvals/${encodeURIComponent(found.row.approval_id)}/${
              story.decide.decision === "approve" ? "approve" : "reject"
            }`;
            try {
              await s.call(path, {
                method: "POST",
                body: {
                  reason: story.decide.reason,
                  comment: story.decide.reason,
                  decided_at: decidedAt,
                  ...(story.decide.reason_code ? { reason_code: story.decide.reason_code } : {}),
                },
              });
              result = story.decide.decision === "approve" ? "approved" : "declined";
              done = true;
              break;
            } catch (err) {
              if (!(err instanceof HttpError && (err.status === 403 || err.status === 409))) throw err;
            }
          }
          if (!done) result = "held (decider unavailable: no password in the local file, or not permitted)";
        }
      }
    }
    summary.push({ n: story.n, outcome, result, trace: traceId });
    log(`${caseId}  ${outcome.padEnd(5)} ${result}`);
  }

  console.log(`\nDone: ${summary.length} cases.`);
  if (file.console_origin) {
    console.log(`Open ${file.console_origin}/aegis/traces to browse them.`);
  }
}

main().catch((err) => {
  if (err instanceof HttpError) fail(`Request failed: ${err.message}`);
  throw err;
});
