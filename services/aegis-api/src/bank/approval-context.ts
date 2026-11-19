/**
 * Derive approval metadata (required role, required fields, escalation window)
 * from a sealed governed decision, server-side, so a real intake -> approval
 * request path needs no direct database patching.
 *
 * The caller never supplies roles: they are re-derived from the org's active
 * policy, authority matrix and role ladder using the sealed event's attributes.
 */
import type pg from "pg";
import { getActivePoliciesWithRules } from "../repo/policies.js";
import { evaluateBankEvent } from "./evaluate.js";
import { DEMO_TENANT_ESCALATION, isOrganizationDemo } from "./demo-tenant.js";
import { listAuthorityMatrix, listBankRoleLadder } from "./repo.js";
import type { RuleCombineMode } from "../policy/evaluate-rules.js";

export type DerivedApprovalMetadata = {
  /** Hard stop: cannot be approved, only released by the named role with a reason. */
  hard_stop?: boolean;
  /** FRD-* hard stops: release is a fraud-block override, not ordinary approval. */
  fraud_block?: boolean;
  release_requires_role?: string;
  required_role?: string;
  required_roles?: string[];
  required_fields?: string[];
  escalate_to_role?: string;
  /** Milliseconds after request before the approval escalates (config, not a clock). */
  escalate_after_ms?: number;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

/** Pure: fold matched obligations into approval metadata. */
export function metadataFromObligations(
  obligations: unknown[],
  requiredRoles: string[],
): DerivedApprovalMetadata {
  const out: DerivedApprovalMetadata = {};
  if (requiredRoles.length > 0) {
    out.required_role = requiredRoles[0];
    out.required_roles = requiredRoles;
  }
  const fields = new Set<string>();
  let escalateAfter: number | undefined;
  let escalateTo: string | undefined;
  for (const obl of obligations) {
    if (!obl || typeof obl !== "object") continue;
    const o = obl as Record<string, unknown>;
    for (const f of stringArray(o.required_fields)) fields.add(f);
    const after = Number(o.escalate_after_ms);
    if (Number.isFinite(after) && after > 0) {
      escalateAfter = escalateAfter === undefined ? after : Math.min(escalateAfter, after);
    }
    if (typeof o.escalate_to_role === "string" && o.escalate_to_role.trim()) {
      escalateTo = o.escalate_to_role.trim();
    }
  }
  if (fields.size > 0) out.required_fields = [...fields];
  if (escalateAfter !== undefined && escalateTo) {
    out.escalate_after_ms = escalateAfter;
    out.escalate_to_role = escalateTo;
  }
  return out;
}

export async function deriveApprovalMetadata(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  eventId: string,
): Promise<DerivedApprovalMetadata> {
  const ev = await client.query<{ payload: unknown; tool_name: string | null }>(
    `SELECT payload, tool_name FROM event
      WHERE organization_id = $1 AND event_id = $2`,
    [organizationId, eventId],
  );
  const row = ev.rows[0];
  const payload =
    row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;
  const attributes =
    payload?.attributes &&
    typeof payload.attributes === "object" &&
    !Array.isArray(payload.attributes)
      ? (payload.attributes as Record<string, unknown>)
      : null;
  // Only governed (bank) decisions carry attributes + a product.
  if (!row || !payload || !attributes) return {};

  const actives = await getActivePoliciesWithRules(client, organizationId);
  const primary = actives[0];
  if (!primary) return {};
  const combine: RuleCombineMode =
    primary.policy.combine === "all_matching" ? "all_matching" : "top_priority";

  const result = evaluateBankEvent({
    policy_id: primary.policy.policy_id,
    combine,
    rules: primary.rules.map((r) => ({
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
    })),
    tool_name: row.tool_name ?? "governed.action",
    attributes,
    matrix_rows: await listAuthorityMatrix(client, organizationId),
    ladder: await listBankRoleLadder(client, organizationId),
    product: typeof payload.product === "string" ? payload.product : undefined,
  });
  const ladder = await listBankRoleLadder(client, organizationId);
  const topRole = [...ladder].sort((a, b) => b.level - a.level)[0]?.role_key;

  if (result.outcome === "stop") {
    // Hard stops cannot be ordinary-approved; release needs a named role + reason.
    const stopRule = primary.rules.find(
      (r) =>
        result.matched_rules.some((m) => m.rule_id === r.rule_id) &&
        r.conditions &&
        typeof r.conditions === "object" &&
        (r.conditions as { hard_stop?: unknown }).hard_stop === true,
    );
    if (!stopRule || !topRole) return {};
    // PolicyRuleRow stores obligations under conditions (no top-level column).
    const obl =
      stopRule.conditions &&
      typeof stopRule.conditions === "object" &&
      (stopRule.conditions as { obligations?: unknown }).obligations &&
      typeof (stopRule.conditions as { obligations: unknown }).obligations ===
        "object"
        ? ((stopRule.conditions as { obligations: Record<string, unknown> })
            .obligations)
        : {};
    const releaseRole =
      (typeof obl.release_requires_role === "string" &&
        obl.release_requires_role) ||
      (typeof obl.required_role === "string" && obl.required_role) ||
      topRole;
    const isFraudBlock = stopRule.rule_id.startsWith("FRD-");
    return {
      hard_stop: true,
      fraud_block: isFraudBlock,
      release_requires_role: releaseRole,
      required_role: releaseRole,
      required_roles: [releaseRole],
      required_fields: ["reason_code", "comment"],
    };
  }
  if (result.outcome !== "hold") return {};

  const derived = metadataFromObligations(result.obligations, result.required_roles);
  // Matrix-driven holds carry no per-rule obligations; a demo tenant still
  // escalates them after the configured window.
  if (derived.escalate_after_ms === undefined && (await isOrganizationDemo(client, organizationId))) {
    const level = (role: string | undefined) =>
      ladder.find((r) => r.role_key === role)?.level;
    const target = DEMO_TENANT_ESCALATION.toRole;
    const targetLevel = level(target);
    const requiredLevel = level(derived.required_role);
    if (targetLevel !== undefined && (requiredLevel === undefined || requiredLevel < targetLevel)) {
      derived.escalate_after_ms = DEMO_TENANT_ESCALATION.afterMs;
      derived.escalate_to_role = target;
    }
  }
  return derived;
}
