import type pg from "pg";
import { getActivePoliciesWithRules } from "../repo/policies.js";
import {
  ensureDefaultScoreBands,
  matchScoreBand,
} from "../repo/score-bands.js";
import { parseConditions } from "./amount.js";
import { evaluateRulesWithConditions } from "./evaluate-conditions.js";
import { evaluateWithOpa } from "./evaluate-opa.js";
import type { PolicyRuleInput } from "./evaluate-rules.js";
import { payloadContextFromPayload } from "./payload-context.js";

export type EvaluateInput = {
  organizationId: string;
  agentId: string;
  toolName: string;
  payload?: Record<string, unknown>;
};

export type EvaluateOutput = {
  decision: "allow" | "deny" | "allow_with_obligation";
  policy_id: string;
  rule_id: string | null;
  reason: string;
  engine: "opa" | "rules";
  decision_layer?: "ceiling" | "contextual" | "override" | "default" | "agent";
  signals?: Record<string, unknown>;
};

function rulesNeedConditionEngine(rules: PolicyRuleInput[]): boolean {
  return rules.some((r) => {
    const c = parseConditions(r.conditions);
    if (!c?.rule_type) {
      return false;
    }
    if (
      c.rule_type === "max_per_tx" ||
      c.rule_type === "min_per_tx" ||
      c.rule_type === "max_daily_total" ||
      c.rule_type === "blocked_beneficiary" ||
      c.rule_type === "beneficiary_match"
    ) {
      return true;
    }
    const when = c.when;
    return Boolean(
      when &&
        (when.segment ||
          when.segments?.length ||
          when.account_type ||
          when.account_types?.length ||
          when.beneficiary ||
          when.beneficiaries?.length ||
          when.merchant_age_days_lt != null ||
          when.merchant_age_days_lte != null ||
          when.risk_tier),
    );
  });
}

export async function evaluateToolPolicy(
  client: pg.Pool | pg.PoolClient,
  input: EvaluateInput,
): Promise<EvaluateOutput> {
  const agentRow = await client.query<{
    active: boolean;
    environment: string | null;
  }>(
    `SELECT active, COALESCE(environment, 'production') AS environment FROM agent
     WHERE organization_id = $1 AND agent_id = $2`,
    [input.organizationId, input.agentId],
  );
  if (agentRow.rows[0] && agentRow.rows[0].active === false) {
    return {
      decision: "deny",
      policy_id: "agent_kill_switch",
      rule_id: null,
      reason: `agent ${input.agentId} is suspended (kill switch)`,
      engine: "rules",
      decision_layer: "agent",
    };
  }

  const envRaw = agentRow.rows[0]?.environment;
  const environment =
    envRaw === "sandbox" || envRaw === "production" ? envRaw : "production";
  const actives = await getActivePoliciesWithRules(
    client,
    input.organizationId,
    environment,
  );
  if (actives.length === 0) {
    return {
      decision: "allow",
      policy_id: "none",
      rule_id: null,
      reason: "no active policy (default allow)",
      engine: "rules",
      decision_layer: "default",
    };
  }

  const rules: PolicyRuleInput[] = actives.flatMap(({ policy, rules: policyRules }) =>
    policyRules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions,
      policy_id: policy.policy_id,
    })),
  );

  const fallbackPolicyId = actives[0]!.policy.policy_id;

  const evalContext = {
    toolName: input.toolName,
    payload: input.payload,
    organizationId: input.organizationId,
  };

  let base: EvaluateOutput;
  if (rulesNeedConditionEngine(rules)) {
    const rulesResult = await evaluateRulesWithConditions(
      client,
      fallbackPolicyId,
      rules,
      evalContext,
    );
    base = { ...rulesResult, engine: "rules" };
  } else if (actives.length === 1) {
    const single = actives[0]!;
    const opaResult = await evaluateWithOpa(
      single.policy.policy_id,
      rules,
      input.toolName,
      single.policy.wasm_artifact,
    );
    if (opaResult) {
      base = { ...opaResult, engine: "opa" };
    } else {
      const rulesResult = await evaluateRulesWithConditions(
        client,
        fallbackPolicyId,
        rules,
        evalContext,
      );
      base = { ...rulesResult, engine: "rules" };
    }
  } else {
    const rulesResult = await evaluateRulesWithConditions(
      client,
      fallbackPolicyId,
      rules,
      evalContext,
    );
    base = { ...rulesResult, engine: "rules" };
  }

  return applyScoreBandsAndSignalFallback(client, input, environment, base);
}

async function applyScoreBandsAndSignalFallback(
  client: pg.Pool | pg.PoolClient,
  input: EvaluateInput,
  environment: "production" | "sandbox",
  base: EvaluateOutput,
): Promise<EvaluateOutput> {
  const ctx = payloadContextFromPayload(input.payload);
  const org = await client.query<{
    signal_fallback: string;
    signal_stale_hours: number;
  }>(
    `SELECT COALESCE(signal_fallback, 'allow_with_obligation') AS signal_fallback,
            COALESCE(signal_stale_hours, 24) AS signal_stale_hours
     FROM organization WHERE organization_id = $1`,
    [input.organizationId],
  );
  const fallbackRaw = org.rows[0]?.signal_fallback ?? "allow_with_obligation";
  const fallbackDecision =
    fallbackRaw === "allow" || fallbackRaw === "deny"
      ? fallbackRaw
      : "allow_with_obligation";
  const staleHours = Number(org.rows[0]?.signal_stale_hours ?? 24);

  let signals = { ...(base.signals ?? {}) };
  let decision = base.decision;
  let reason = base.reason;
  let decision_layer = base.decision_layer;
  let policy_id = base.policy_id;
  let rule_id = base.rule_id;

  const payloadRoot = input.payload ?? {};
  const expectRisk =
    payloadRoot.expect_risk_signal === true ||
    payloadRoot.require_risk_signal === true;
  let scoreStale = false;
  if (ctx.risk_score != null && ctx.risk_score_at) {
    const at = new Date(ctx.risk_score_at).getTime();
    if (Number.isFinite(at)) {
      scoreStale = Date.now() - at > staleHours * 3_600_000;
    }
  }
  const scoreMissing = expectRisk && ctx.risk_score == null;

  // Do not change decisions for traffic that never supplies risk signals.
  if (scoreMissing || scoreStale) {
    decision = fallbackDecision;
    reason = scoreMissing
      ? `missing risk signal; fallback ${fallbackDecision}`
      : `stale risk signal; fallback ${fallbackDecision}`;
    decision_layer = "contextual";
    policy_id = "signal_fallback";
    rule_id = null;
    signals = {
      ...signals,
      signal_fallback: fallbackDecision,
      signal_fallback_reason: scoreMissing ? "missing" : "stale",
    };
  } else if (typeof ctx.risk_score === "number") {
    try {
      const bands = await ensureDefaultScoreBands(
        client,
        input.organizationId,
        environment,
      );
      const band = matchScoreBand(bands, ctx.risk_score);
      if (band) {
        // Highest severity wins vs rule allow: band can escalate Ask/Stop.
        const rank = (d: string) =>
          d === "deny" ? 3 : d === "allow_with_obligation" ? 2 : 1;
        if (rank(band.decision) > rank(decision)) {
          decision = band.decision;
          reason = `score band ${band.name} (${band.min_score}-${band.max_score})`;
          decision_layer = "contextual";
          policy_id = "score_band";
          rule_id = band.band_id;
        }
        signals = {
          ...signals,
          risk_score: ctx.risk_score,
          ...(ctx.risk_score_source ? { source: ctx.risk_score_source } : {}),
          ...(ctx.risk_model_name ? { model_name: ctx.risk_model_name } : {}),
          ...(ctx.risk_model_version
            ? { model_version: ctx.risk_model_version }
            : {}),
          band: band.name,
          band_threshold: { min: band.min_score, max: band.max_score },
          band_decision: band.decision,
          ...(band.require_four_eyes ? { require_four_eyes: true } : {}),
        };
      }
    } catch {
      // score_band table may be missing pre-migrate 009
    }
  }

  return {
    ...base,
    decision,
    reason,
    decision_layer,
    policy_id,
    rule_id,
    ...(Object.keys(signals).length > 0 ? { signals } : {}),
  };
}
