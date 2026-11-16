import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  buildAuthorityMatrixView,
  previewBankRules,
} from "../../bank/rule-preview.js";
import {
  listAuthorityMatrix,
  listBankRoleLadder,
} from "../../bank/repo.js";
import {
  getActivePoliciesWithRules,
  listPoliciesByOrganization,
} from "../../repo/policies.js";
import type { RuleCombineMode } from "../../policy/evaluate-rules.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const ruleRoutes = new Hono<{ Variables: ConsoleVariables }>();

/**
 * Authority matrix with plain labels: product, amount band, risk, required role
 * (or above, from the role ladder) and rule code. Read-only.
 */
ruleRoutes.get("/authority-matrix", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const pool = getPool();
  try {
    const [rows, ladder] = await Promise.all([
      listAuthorityMatrix(pool, orgId),
      listBankRoleLadder(pool, orgId),
    ]);
    return c.json({
      rows: buildAuthorityMatrixView(rows, ladder),
      roles: ladder.map((r) => ({
        role_key: r.role_key,
        display_name: r.display_name,
        level: r.level,
      })),
    });
  } catch {
    // Bank tables not migrated: an empty matrix is the honest answer.
    return c.json({ rows: [], roles: [] });
  }
});

type PreviewBody = {
  product?: unknown;
  amount?: unknown;
  currency?: unknown;
  risk_tier?: unknown;
  model_score?: unknown;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * What would the rules decide? Runs the live evaluator (authority matrix +
 * active policy rules) for a product and amount. Preview only: no case, no seal.
 */
ruleRoutes.post("/rules/preview", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  let body: PreviewBody;
  try {
    body = (await c.req.json()) as PreviewBody;
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const product = typeof body.product === "string" ? body.product.trim() : "";
  if (!product) return c.json({ error: "product required" }, 422);
  const amount = asNumber(body.amount);
  if (amount == null || amount < 0) {
    return c.json({ error: "amount must be a number, 0 or more" }, 422);
  }
  const riskTier =
    typeof body.risk_tier === "string" && body.risk_tier.trim()
      ? body.risk_tier.trim()
      : null;
  const modelScore = asNumber(body.model_score);

  const pool = getPool();
  let matrix: Awaited<ReturnType<typeof listAuthorityMatrix>> = [];
  let ladder: Awaited<ReturnType<typeof listBankRoleLadder>> = [];
  try {
    [matrix, ladder] = await Promise.all([
      listAuthorityMatrix(pool, orgId),
      listBankRoleLadder(pool, orgId),
    ]);
  } catch {
    return c.json({ error: "Authority matrix is not available", code: "no_matrix" }, 503);
  }

  const currency =
    (typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : null) ??
    matrix.find((r) => r.product === product)?.currency ??
    null;
  if (!currency) {
    return c.json({ error: "currency required for this product" }, 422);
  }

  const actives = await getActivePoliciesWithRules(pool, orgId);
  const primary = actives[0];
  const combine: RuleCombineMode =
    primary?.policy.combine === "all_matching" ? "all_matching" : "top_priority";

  const preview = previewBankRules({
    product,
    amount,
    currency,
    risk_tier: riskTier,
    model_score: modelScore,
    policy_id: primary?.policy.policy_id ?? "pol_none",
    policy_version: primary?.policy.version ?? 0,
    combine,
    rules:
      primary?.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions,
        policy_id: r.policy_id,
        obligations:
          r.conditions &&
          typeof r.conditions === "object" &&
          (r.conditions as { obligations?: unknown }).obligations
            ? (r.conditions as { obligations: unknown }).obligations
            : undefined,
      })) ?? [],
    matrix_rows: matrix,
    ladder,
  });

  return c.json({
    preview,
    input: { product, amount, currency, risk_tier: riskTier },
  });
});

type PublisherRow = {
  policy_id: string;
  email: string | null;
  at: Date;
};

/**
 * Version list for the Rules page: who published each version, who co-approved,
 * and when it went live. Read-only.
 */
ruleRoutes.get("/rules/versions", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const pool = getPool();
  const policies = await listPoliciesByOrganization(pool, orgId);
  const ids = policies.map((p) => p.policy_id);

  const approvals = new Map<string, PublisherRow[]>();
  const activations = new Map<string, PublisherRow>();
  const dual = new Map<string, boolean>();

  if (ids.length > 0) {
    try {
      const flags = await pool.query<{
        policy_id: string;
        dual_publish_required: boolean;
      }>(
        `SELECT policy_id, COALESCE(dual_publish_required, false) AS dual_publish_required
         FROM policy WHERE organization_id = $1 AND policy_id = ANY($2::text[])`,
        [orgId, ids],
      );
      for (const r of flags.rows) dual.set(r.policy_id, r.dual_publish_required);
    } catch {
      /* column absent on older DBs */
    }
    try {
      const res = await pool.query<PublisherRow>(
        `SELECT a.policy_id, ac.email, a.decided_at AS at
         FROM policy_publish_approval a
         LEFT JOIN membership m ON m.membership_id = a.membership_id
         LEFT JOIN account ac ON ac.account_id = m.account_id
         WHERE a.organization_id = $1 AND a.policy_id = ANY($2::text[])
         ORDER BY a.decided_at ASC`,
        [orgId, ids],
      );
      for (const r of res.rows) {
        const list = approvals.get(r.policy_id) ?? [];
        list.push(r);
        approvals.set(r.policy_id, list);
      }
    } catch {
      /* dual-publish table absent */
    }
    const audit = await pool.query<PublisherRow>(
      `SELECT a.resource_id AS policy_id,
              COALESCE(ac.email, a.metadata->>'actor_email') AS email,
              a.created_at AS at
       FROM audit_log a
       LEFT JOIN membership m ON m.membership_id = a.user_id
       LEFT JOIN account ac ON ac.account_id = m.account_id
       WHERE a.organization_id = $1
         AND a.action = 'policy.activated'
         AND a.resource_id = ANY($2::text[])
       ORDER BY a.created_at ASC`,
      [orgId, ids],
    );
    for (const r of audit.rows) activations.set(r.policy_id, r);
  }

  return c.json({
    versions: policies.map((p) => {
      const approved = approvals.get(p.policy_id) ?? [];
      const activation = activations.get(p.policy_id) ?? null;
      const needsTwo = dual.get(p.policy_id) ?? false;
      // With dual publish the first approver published, later approvers co-approved.
      const publisher = needsTwo && approved.length > 0 ? approved[0]! : activation;
      const coApprovers = needsTwo ? approved.slice(1) : [];
      return {
        policy_id: p.policy_id,
        name: p.name,
        version: p.version,
        version_label: `v${p.version}`,
        status: p.status,
        activated_at: p.activated_at?.toISOString() ?? null,
        dual_publish_required: needsTwo,
        approvals_recorded: approved.length,
        published_by: publisher
          ? { email: publisher.email, at: publisher.at.toISOString() }
          : null,
        co_approved_by: coApprovers.map((r) => ({
          email: r.email,
          at: r.at.toISOString(),
        })),
        awaiting_second_approver:
          needsTwo && p.status !== "active" && approved.length === 1,
      };
    }),
  });
});
