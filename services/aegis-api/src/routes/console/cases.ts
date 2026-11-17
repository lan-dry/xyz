import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const caseRoutes = new Hono<{ Variables: ConsoleVariables }>();

export type CaseSealStatus =
  | "sealed"
  | "sealed_pending_witness"
  | "provisional"
  | "broken"
  | "unknown";

export type CaseSummary = {
  trace_id: string;
  case_id: string | null;
  outcome: string | null;
  mode: string | null;
  amount: number | null;
  currency: string | null;
  product: string | null;
  event_type: string | null;
  rules: string[];
  /** Rule that drove the outcome (decision_basis.decided_by_rule_id), e.g. the hold rule. */
  decided_by_rule_id: string | null;
  approvers: Array<{
    /** Technical details only; screens show name · role. */
    email: string | null;
    name: string | null;
    /** Bank role key, e.g. credit_manager. */
    role: string | null;
    decision: string;
    decided_at: string | null;
    reason: string | null;
    /** Set when the approver relied on a time-bound delegation: who delegated it. */
    delegated_from_name?: string | null;
    delegated_from_email?: string | null;
  }>;
  approval_status: string | null;
  required_role: string | null;
  requester: string | null;
  seal: CaseSealStatus;
  demo_filler: boolean;
  /** Synthetic back-dated history from pilot:seed-history (labelled on screens). */
  demo_history: boolean;
  created_at: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function sealStatusFor(input: {
  event_count: number;
  provisional: boolean;
  any_broken: boolean;
  all_witnessed: boolean;
}): CaseSealStatus {
  if (input.event_count === 0) return "unknown";
  if (input.any_broken) return "broken";
  if (input.provisional) return "provisional";
  return input.all_witnessed ? "sealed" : "sealed_pending_witness";
}

/**
 * Plain facts for a page of cases (Live feed columns, approval cards).
 * GET /cases/summary?trace_ids=a,b,c  (max 100)
 */
caseRoutes.get("/cases/summary", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const ids = (c.req.query("trace_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) return c.json({ cases: {} });

  const pool = getPool();
  const out: Record<string, CaseSummary> = {};
  for (const id of ids) {
    out[id] = {
      trace_id: id,
      case_id: null,
      outcome: null,
      mode: null,
      amount: null,
      currency: null,
      product: null,
      event_type: null,
      rules: [],
      decided_by_rule_id: null,
      approvers: [],
      approval_status: null,
      required_role: null,
      requester: null,
      seal: "unknown",
      demo_filler: false,
      demo_history: false,
      created_at: null,
    };
  }

  try {
    const cases = await pool.query<{
      trace_id: string;
      case_id: string;
      outcome: string | null;
      mode: string | null;
      attributes: Record<string, unknown> | null;
      matched_rules: Array<{ rule_id?: string }> | null;
      created_at: Date;
    }>(
      `SELECT trace_id, case_id, outcome, mode, attributes, matched_rules, created_at
       FROM bank_case
       WHERE organization_id = $1 AND trace_id = ANY($2::text[])`,
      [orgId, ids],
    );
    const caseToTrace = new Map<string, string>();
    for (const r of cases.rows) {
      const s = out[r.trace_id];
      if (!s) continue;
      const a = r.attributes ?? {};
      caseToTrace.set(r.case_id, r.trace_id);
      s.case_id = r.case_id;
      s.outcome = r.outcome;
      s.mode = r.mode;
      s.amount = num(a.amount ?? a.amount_rwf ?? a.loan_amount);
      s.currency = typeof a.currency === "string" ? a.currency : null;
      s.rules = [
        ...new Set(
          (Array.isArray(r.matched_rules) ? r.matched_rules : [])
            .map((m) => m.rule_id)
            .filter((x): x is string => typeof x === "string" && x !== ""),
        ),
      ];
      s.requester =
        typeof a.requester_email === "string" ? a.requester_email : null;
      s.demo_filler = a.demo_filler === true;
      s.demo_history = a.demo_history === true;
      s.created_at = r.created_at.toISOString();
    }

    if (caseToTrace.size > 0) {
      const rcpt = await pool.query<{
        case_id: string;
        product: string | null;
        event_type: string | null;
      }>(
        `SELECT DISTINCT ON (case_id) case_id, body->>'product' AS product,
                body->>'event_type' AS event_type
         FROM forensic_receipt
         WHERE organization_id = $1 AND case_id = ANY($2::text[])
         ORDER BY case_id, seq DESC`,
        [orgId, [...caseToTrace.keys()]],
      );
      for (const r of rcpt.rows) {
        const s = out[caseToTrace.get(r.case_id) ?? ""];
        if (s) {
          s.product = r.product;
          s.event_type = r.event_type;
        }
      }

      // The rule that drove the outcome (hold rule, not the AUTH-RL allow), from the
      // first receipt's decision_basis for each case.
      const basis = await pool.query<{ case_id: string; decided_by: string | null }>(
        `SELECT DISTINCT ON (case_id) case_id,
                body->'decision_basis'->>'decided_by_rule_id' AS decided_by
         FROM forensic_receipt
         WHERE organization_id = $1 AND case_id = ANY($2::text[])
           AND body->'decision_basis'->>'decided_by_rule_id' IS NOT NULL
         ORDER BY case_id, seq ASC`,
        [orgId, [...caseToTrace.keys()]],
      );
      for (const r of basis.rows) {
        const s = out[caseToTrace.get(r.case_id) ?? ""];
        if (s) s.decided_by_rule_id = r.decided_by;
      }
    }
  } catch {
    // bank tables absent: leave the generic summary.
  }

  const seal = await pool.query<{
    trace_id: string;
    event_count: string;
    provisional: boolean;
    any_broken: boolean;
    all_witnessed: boolean;
  }>(
    `SELECT e.trace_id,
            COUNT(*)::text AS event_count,
            bool_or(e.event_id LIKE 'evt\\_gov\\_%') AS provisional,
            bool_or(e.chain_valid = false) AS any_broken,
            bool_and(p.event_id IS NOT NULL) AS all_witnessed
     FROM event e
     LEFT JOIN inclusion_proof p
       ON p.event_id = e.event_id AND p.organization_id = e.organization_id
     WHERE e.organization_id = $1 AND e.trace_id = ANY($2::text[])
     GROUP BY e.trace_id`,
    [orgId, ids],
  );
  for (const r of seal.rows) {
    const s = out[r.trace_id];
    if (!s) continue;
    s.seal = sealStatusFor({
      event_count: Number(r.event_count),
      provisional: r.provisional,
      any_broken: r.any_broken,
      all_witnessed: r.all_witnessed,
    });
  }

  try {
    const ap = await pool.query<{
      trace_id: string;
      status: string;
      metadata: Record<string, unknown> | null;
      voter_email: string | null;
      voter_name: string | null;
      voter_roles: string[] | null;
      decision: string | null;
      reason: string | null;
      decided_at: Date | null;
    }>(
      `SELECT e.trace_id, a.status, a.metadata, v.voter_email, v.decision,
              v.reason, v.created_at AS decided_at,
              acc.display_name AS voter_name,
              (SELECT array_agg(br.role_key ORDER BY br.role_key)
                 FROM membership_bank_role br
                WHERE br.membership_id = v.voter_user_id) AS voter_roles
       FROM approval a
       JOIN event e ON e.event_id = a.event_id
       LEFT JOIN approval_vote v
         ON v.approval_id = a.approval_id AND v.organization_id = a.organization_id
       LEFT JOIN membership m ON m.membership_id = v.voter_user_id
       LEFT JOIN account acc ON acc.account_id = m.account_id
       WHERE a.organization_id = $1 AND e.trace_id = ANY($2::text[])
       ORDER BY a.created_at ASC, v.created_at ASC`,
      [orgId, ids],
    );
    for (const r of ap.rows) {
      const s = out[r.trace_id];
      if (!s) continue;
      s.approval_status = r.status;
      if (typeof r.metadata?.required_role === "string") {
        s.required_role = r.metadata.required_role;
      }
      if (r.decision) {
        const roles = r.voter_roles ?? [];
        const needed =
          typeof r.metadata?.required_role === "string" ? r.metadata.required_role : null;
        const metaVotes = Array.isArray(r.metadata?.votes)
          ? (r.metadata!.votes as Array<Record<string, unknown>>)
          : [];
        const delegation = metaVotes.find(
          (m) => m.voter_email === r.voter_email && m.decision === r.decision,
        )?.delegation as
          | { role_key?: string; delegator?: { name?: string | null; email?: string | null } }
          | undefined;
        s.approvers.push({
          email: r.voter_email,
          name: r.voter_name?.trim() || null,
          // A delegated approver acted in the delegated role, not a permanent one.
          role:
            delegation?.role_key ??
            (needed && roles.includes(needed) ? needed : roles[0]) ??
            null,
          decision: r.decision,
          decided_at: r.decided_at ? r.decided_at.toISOString() : null,
          reason: r.reason?.trim() || null,
          ...(delegation
            ? {
                delegated_from_name: delegation.delegator?.name ?? null,
                delegated_from_email: delegation.delegator?.email ?? null,
              }
            : {}),
        });
      }
    }
  } catch {
    // approval_vote absent on older DBs
  }

  return c.json({ cases: out });
});
