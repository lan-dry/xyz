import type pg from "pg";
import {
  amountUsdFromPayload,
  parseConditions,
  type PolicyConditions,
  type PolicyLayer,
} from "./amount.js";
import { toolMatches } from "./match.js";
import type { PolicyRuleInput } from "./evaluate-rules.js";
import type { PolicyEvaluation } from "./evaluate-rules.js";
import { evaluateRules } from "./evaluate-rules.js";
import {
  matchesPolicyWhen,
  payloadContextFromPayload,
  type PayloadContext,
} from "./payload-context.js";

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

function ruleLayer(conditions: PolicyConditions | null): PolicyLayer {
  const layer = conditions?.layer;
  if (layer === "ceiling" || layer === "override" || layer === "contextual") {
    return layer;
  }
  return "contextual";
}

function resolveMaxAmountUsd(
  conditions: PolicyConditions,
  ctx: PayloadContext,
): { max: number | undefined; fail: boolean; detail?: string } {
  const source = conditions.limit_source ?? "fixed";
  if (source === "segment_table") {
    const table = conditions.segment_limits ?? {};
    const seg = ctx.segment;
    if (!seg) {
      return { max: undefined, fail: true, detail: "no customer segment for limit table" };
    }
    const raw = table[seg] ?? table[seg.toLowerCase()];
    const max = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(max)) {
      return {
        max: undefined,
        fail: true,
        detail: `no limit in segment table for ${seg}`,
      };
    }
    return { max, fail: false };
  }
  if (source === "lookup") {
    // Phase 2 stub: lookup not wired — treat as fail so on_lookup_fail applies.
    return { max: undefined, fail: true, detail: "limit lookup unavailable" };
  }
  const max = Number(conditions.max_amount_usd);
  if (!Number.isFinite(max) || max < 0) {
    return { max: undefined, fail: true, detail: "fixed max_amount_usd missing" };
  }
  return { max, fail: false };
}

type Breach = {
  rule: PolicyRuleInput;
  reason: string;
  layer: PolicyLayer;
  decision: "deny" | "allow_with_obligation";
};

async function conditionBreach(
  client: pg.Pool | pg.PoolClient,
  rule: PolicyRuleInput,
  ctx: PolicyEvalContext,
): Promise<Breach | null> {
  const conditions = parseConditions(rule.conditions);
  if (!conditions?.rule_type || conditions.rule_type === "tool") {
    return null;
  }

  const payloadContext = payloadContextFromPayload(ctx.payload);
  if (!matchesPolicyWhen(conditions.when, payloadContext)) {
    return null;
  }

  const layer = ruleLayer(conditions);
  const failMode = conditions.on_lookup_fail ?? "skip";

  if (conditions.rule_type === "blocked_beneficiary") {
    const list =
      conditions.blocked_beneficiaries ??
      (conditions as { beneficiaries?: string[] }).beneficiaries ??
      [];
    const ben = payloadContext.beneficiary?.toLowerCase();
    if (!ben || list.length === 0) {
      return null;
    }
    const hit = list.find((b) => b.toLowerCase() === ben);
    if (hit) {
      return {
        rule,
        layer,
        decision: rule.decision === "allow_with_obligation" ? "allow_with_obligation" : "deny",
        reason: `beneficiary ${payloadContext.beneficiary} is blocked`,
      };
    }
    return null;
  }

  /** Claude §13.1 — destination must match customer on file (manipulated-agent stop). */
  if (conditions.rule_type === "beneficiary_match") {
    const field = conditions.expected_beneficiary_field?.trim();
    const expectedRaw = field
      ? ctx.payload?.[field]
      : payloadContext.expected_beneficiary ??
        payloadContext.customer_on_file;
    const expected =
      typeof expectedRaw === "string" && expectedRaw.trim()
        ? expectedRaw.trim().toLowerCase()
        : undefined;
    const ben = payloadContext.beneficiary?.toLowerCase();
    if (!ben || !expected) {
      if (failMode === "allow_with_obligation") {
        return {
          rule,
          layer,
          decision: "allow_with_obligation",
          reason:
            "beneficiary match check missing destination or customer on file; asking a person",
        };
      }
      if (failMode === "deny") {
        return {
          rule,
          layer,
          decision: "deny",
          reason:
            "beneficiary match check missing destination or customer on file; stopped",
        };
      }
      return null;
    }
    if (ben !== expected) {
      return {
        rule,
        layer,
        decision: "deny",
        reason:
          "refund destination does not match the customer on record",
      };
    }
    return null;
  }

  const amountUsd = amountUsdFromPayload(ctx.payload);

  if (conditions.rule_type === "max_per_tx") {
    const resolved = resolveMaxAmountUsd(conditions, payloadContext);
    if (resolved.fail || resolved.max === undefined) {
      if (failMode === "allow_with_obligation") {
        return {
          rule,
          layer,
          decision: "allow_with_obligation",
          reason: resolved.detail
            ? `limit lookup failed (${resolved.detail}); asking a person`
            : "limit lookup failed; asking a person",
        };
      }
      if (failMode === "deny") {
        return {
          rule,
          layer,
          decision: "deny",
          reason: resolved.detail
            ? `limit lookup failed (${resolved.detail}); stopped`
            : "limit lookup failed; stopped",
        };
      }
      return null;
    }
    if (amountUsd === undefined) {
      if (failMode === "allow_with_obligation") {
        return {
          rule,
          layer,
          decision: "allow_with_obligation",
          reason: "amount missing; asking a person",
        };
      }
      if (failMode === "deny") {
        return {
          rule,
          layer,
          decision: "deny",
          reason: "amount missing; stopped",
        };
      }
      return null;
    }
    if (amountUsd > resolved.max) {
      const source = conditions.limit_source ?? "fixed";
      const tierNote =
        source === "segment_table" && payloadContext.segment
          ? ` for ${payloadContext.segment}`
          : "";
      return {
        rule,
        layer,
        decision:
          rule.decision === "allow_with_obligation" ? "allow_with_obligation" : "deny",
        reason: `transaction $${amountUsd} exceeds per-tx limit $${resolved.max}${tierNote}`,
      };
    }
    return null;
  }

  if (conditions.rule_type === "min_per_tx") {
    const min = Number(conditions.min_amount_usd);
    if (!Number.isFinite(min) || min < 0) {
      return null;
    }
    if (amountUsd === undefined) {
      return null;
    }
    if (amountUsd < min) {
      return {
        rule,
        layer,
        decision:
          rule.decision === "allow_with_obligation" ? "allow_with_obligation" : "deny",
        reason: `transaction $${amountUsd} below minimum $${min}`,
      };
    }
    return null;
  }

  if (conditions.rule_type === "max_daily_total") {
    const max = Number(conditions.max_amount_usd);
    if (!Number.isFinite(max) || max < 0) {
      return null;
    }
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
      return {
        rule,
        layer,
        decision:
          rule.decision === "allow_with_obligation" ? "allow_with_obligation" : "deny",
        reason: `daily total would be $${projected.toFixed(2)} (prior $${prior.toFixed(2)} + $${amountUsd}) over $${max} limit (${windowHours}h window)`,
      };
    }
    return null;
  }

  return null;
}

function ruleAppliesInContext(rule: PolicyRuleInput, ctx: PolicyEvalContext): boolean {
  const conditions = parseConditions(rule.conditions);
  if (!conditions?.rule_type) {
    return true;
  }
  const payloadContext = payloadContextFromPayload(ctx.payload);
  // Tool rules with a when clause (e.g. KYC risk_tier=high) must still filter.
  if (!matchesPolicyWhen(conditions.when, payloadContext)) {
    return false;
  }
  if (conditions.rule_type === "tool") {
    return true;
  }
  if (conditions.rule_type === "blocked_beneficiary") {
    const list = conditions.blocked_beneficiaries ?? [];
    const ben = payloadContext.beneficiary?.toLowerCase();
    if (!ben || list.length === 0) return false;
    return list.some((b) => b.toLowerCase() === ben);
  }
  if (
    conditions.rule_type === "max_per_tx" ||
    conditions.rule_type === "min_per_tx" ||
    conditions.rule_type === "max_daily_total"
  ) {
    // Still apply when amount missing if on_lookup_fail asks a person / denies.
    if (amountUsdFromPayload(ctx.payload) !== undefined) return true;
    const failMode = conditions.on_lookup_fail ?? "skip";
    return failMode !== "skip";
  }
  return true;
}

function layerRank(layer: PolicyLayer): number {
  if (layer === "ceiling") return 3;
  if (layer === "contextual") return 2;
  return 1; // override
}

function signalsFromPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const ctx = payloadContextFromPayload(payload);
  if (ctx.risk_score == null) return undefined;
  return {
    risk_score: ctx.risk_score,
    ...(ctx.risk_score_source ? { source: ctx.risk_score_source } : {}),
    ...(ctx.risk_model_name ? { model_name: ctx.risk_model_name } : {}),
    ...(ctx.risk_model_version ? { model_version: ctx.risk_model_version } : {}),
    ...(ctx.risk_score_at ? { scored_at: ctx.risk_score_at } : {}),
  };
}

export async function evaluateRulesWithConditions(
  client: pg.Pool | pg.PoolClient,
  policyId: string,
  rules: PolicyRuleInput[],
  ctx: PolicyEvalContext,
): Promise<PolicyEvaluation> {
  const matching = rules.filter(
    (r) => toolMatches(r.tool_pattern, ctx.toolName) && ruleAppliesInContext(r, ctx),
  );

  const breaches: Breach[] = [];
  for (const rule of matching) {
    const breach = await conditionBreach(client, rule, ctx);
    if (breach) {
      breaches.push(breach);
    }
  }

  const signals = signalsFromPayload(ctx.payload);

  if (breaches.length > 0) {
    // §12.3: ceilings first, then contextual, then overrides; within layer by priority.
    breaches.sort((a, b) => {
      const lr = layerRank(b.layer) - layerRank(a.layer);
      if (lr !== 0) return lr;
      return b.rule.priority - a.rule.priority;
    });
    const top = breaches[0]!;
    return {
      decision: top.decision,
      policy_id: top.rule.policy_id ?? policyId,
      rule_id: top.rule.rule_id,
      reason: top.reason,
      decision_layer: top.layer,
      ...(signals ? { signals } : {}),
    };
  }

  // Amount / beneficiary rules only apply on breach; fall back to plain tool rules.
  const toolOnly = matching.filter((r) => {
    const conditions = parseConditions(r.conditions);
    return !conditions?.rule_type || conditions.rule_type === "tool";
  });
  const base = evaluateRules(policyId, toolOnly, ctx.toolName);
  return {
    ...base,
    decision_layer: "default",
    ...(signals ? { signals } : {}),
  };
}
