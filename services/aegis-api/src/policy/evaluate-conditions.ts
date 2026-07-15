import type pg from "pg";
import {
  amountUsdFromPayload,
  parseConditions,
  type PolicyConditions,
} from "./amount.js";
import { toolMatches } from "./match.js";
import type { PolicyRuleInput } from "./evaluate-rules.js";
import type { PolicyEvaluation } from "./evaluate-rules.js";
import { evaluateRules } from "./evaluate-rules.js";

export type PolicyEvalContext = {
  toolName: string;
  payload?: Record<string, unknown>;
  organizationId: string;
};

export async function sumDailyAmountUsd(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  toolPattern: string,
  windowHours: number,
): Promise<number> {
  const hours = Math.min(Math.max(windowHours, 1), 168);
  const pattern = toolPattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const result = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN (payload->>'amount_usd') ~ '^-?[0-9]+(\\.[0-9]+)?$'
           THEN (payload->>'amount_usd')::numeric
         WHEN (payload->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
           THEN (payload->>'amount')::numeric
         ELSE 0
       END
     ), 0)::text AS total
     FROM event
     WHERE organization_id = $1
       AND ingested_at >= now() - ($2::int * interval '1 hour')
       AND tool_name IS NOT NULL
       AND tool_name LIKE $3 ESCAPE '\\'`,
    [organizationId, String(hours), pattern.replace(/\*/g, "%")],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function conditionBreachReason(
  client: pg.Pool | pg.PoolClient,
  rule: PolicyRuleInput,
  ctx: PolicyEvalContext,
): Promise<string | null> {
  const conditions = parseConditions(rule.conditions);
  if (!conditions?.rule_type || conditions.rule_type === "tool") {
    return null;
  }

  const amountUsd = amountUsdFromPayload(ctx.payload);
  const max = Number(conditions.max_amount_usd);
  if (!Number.isFinite(max) || max < 0) {
    return null;
  }

  if (conditions.rule_type === "max_per_tx") {
    if (amountUsd === undefined) {
      return null;
    }
    if (amountUsd > max) {
      return `transaction $${amountUsd} exceeds per-tx limit $${max}`;
    }
    return null;
  }

  if (conditions.rule_type === "max_daily_total") {
    if (amountUsd === undefined) {
      return null;
    }
    const windowHours = conditions.window_hours ?? 24;
    const prior = await sumDailyAmountUsd(
      client,
      ctx.organizationId,
      rule.tool_pattern,
      windowHours,
    );
    const projected = prior + amountUsd;
    if (projected > max) {
      return `daily total would be $${projected.toFixed(2)} (prior $${prior.toFixed(2)} + $${amountUsd}) over $${max} limit (${windowHours}h window)`;
    }
    return null;
  }

  return null;
}

export async function evaluateRulesWithConditions(
  client: pg.Pool | pg.PoolClient,
  policyId: string,
  rules: PolicyRuleInput[],
  ctx: PolicyEvalContext,
): Promise<PolicyEvaluation> {
  const matching = rules.filter((r) => toolMatches(r.tool_pattern, ctx.toolName));

  const breaches: Array<{ rule: PolicyRuleInput; reason: string }> = [];
  for (const rule of matching) {
    const reason = await conditionBreachReason(client, rule, ctx);
    if (reason) {
      breaches.push({ rule, reason });
    }
  }

  if (breaches.length > 0) {
    breaches.sort((a, b) => b.rule.priority - a.rule.priority);
    const top = breaches[0]!;
    return {
      decision: "deny",
      policy_id: policyId,
      rule_id: top.rule.rule_id,
      reason: top.reason,
    };
  }

  return evaluateRules(policyId, rules, ctx.toolName);
}
