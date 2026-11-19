/**
 * Apply a demo policy pack (roles, matrix, field policies, rules, workflow) to an org.
 * Shared by `pack:apply` (CLI) and the console demo-tenant setup route.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { policyContentHash } from "../bank/policy-hash.js";
import { seedAuthorityFromPack } from "../bank/repo.js";
import { PolicyRuleValidationError, validatePolicyRules } from "../bank/rule-validate.js";
import { executionConfigFromPackWorkflow } from "../execution/workflow-config.js";
import { loadDemoPack, packMatrixRows, packRoles } from "./load.js";

export type ApplyPackOptions = {
  /**
   * Escalation config copied onto human-approval obligations of held rules
   * (read by the approval request path; real elapsed time, not the demo clock).
   */
  escalation?: { afterMs: number; toRole: string };
  /**
   * When false (default), existing role display names, field policies, and
   * workflows are left alone (insert-only). Pass true to replace them.
   */
  force?: boolean;
};

export type ApplyPackResult = {
  policyId: string;
  packId: string;
  packVersion: number;
  combine: string;
  ruleCount: number;
  escalationRules: string[];
  overwritten: boolean;
};

function isHumanApproval(obligations: unknown): boolean {
  if (!obligations || typeof obligations !== "object") return false;
  const kind = String((obligations as { kind?: unknown }).kind ?? "").toLowerCase();
  return kind === "human_approval";
}

/**
 * Caller owns the transaction (BEGIN/COMMIT). Retires the org's other active
 * policies, so applying twice creates a fresh active policy (the previous one is archived).
 * Tenant configuration rows are not silently overwritten unless `force: true`.
 */
export async function applyDemoPack(
  client: pg.PoolClient,
  orgId: string,
  packName: "banking" | "insurance",
  options: ApplyPackOptions = {},
): Promise<ApplyPackResult> {
  const pack = loadDemoPack(packName);
  if (!pack.demo_only) {
    throw new Error("Refusing to apply non-demo pack");
  }
  const force = options.force === true;

  const escalationRules: string[] = [];
  const rules = pack.rules.map((r) => {
    if (options.escalation && isHumanApproval(r.obligations)) {
      escalationRules.push(r.rule_id);
      return {
        ...r,
        obligations: {
          ...(r.obligations as Record<string, unknown>),
          escalate_after_ms: options.escalation.afterMs,
          escalate_to_role: options.escalation.toRole,
        },
      };
    }
    return r;
  });

  // Retire legacy un-scoped pack rows on this org (pre-scoping applies) so
  // they don't duplicate the org-scoped rows seeded below.
  await client.query(
    `UPDATE authority_matrix SET active = false
      WHERE organization_id = $1 AND matrix_id = ANY($2::text[])`,
    [orgId, packMatrixRows(pack).map((r) => r.matrix_id)],
  );
  await seedAuthorityFromPack(
    client,
    orgId,
    packRoles(pack),
    // matrix_id is a GLOBAL primary key and ON CONFLICT never moves a row between
    // orgs, so scope ids per org so every org gets its own rows.
    packMatrixRows(pack).map((row) => ({
      ...row,
      matrix_id: `${row.matrix_id}_${orgId.replace(/-/g, "").slice(0, 8)}`,
    })),
    { force },
  );

  for (const fp of pack.field_policies) {
    const keepLast = fp.mask_keep_last ?? 4;
    if (force) {
      await client.query(
        `INSERT INTO field_policy (
           organization_id, field_path, mode, mask_keep_last
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, field_path) DO UPDATE SET
           mode = EXCLUDED.mode,
           mask_keep_last = EXCLUDED.mask_keep_last`,
        [orgId, fp.field_path, fp.mode, keepLast],
      );
    } else {
      await client.query(
        `INSERT INTO field_policy (
           organization_id, field_path, mode, mask_keep_last
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, field_path) DO NOTHING`,
        [orgId, fp.field_path, fp.mode, keepLast],
      );
    }
  }

  // Deactivate other active policies so pack rules are primary.
  await client.query(
    `UPDATE policy SET status = 'archived'
     WHERE organization_id = $1 AND status = 'active'`,
    [orgId],
  );

  const policyId = `pol_pack_${pack.id.replace(/\W/g, "_")}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const contentHash = policyContentHash({
    policy_id: policyId,
    name: pack.name,
    version: pack.version,
    combine: pack.combine,
    rules: rules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions ?? null,
    })),
  });

  await client.query(
    `INSERT INTO policy (
       policy_id, organization_id, name, version, status, combine, content_hash, activated_at
     ) VALUES ($1, $2, $3, $4, 'active', $5, $6, now())`,
    [policyId, orgId, pack.name, pack.version, pack.combine, contentHash],
  );

  const issues = validatePolicyRules(
    rules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions ?? null,
      obligations: r.obligations,
    })),
  );
  if (issues.length > 0) throw new PolicyRuleValidationError(issues);

  for (const rule of rules) {
    const conditions = {
      ...(rule.conditions ?? {}),
      ...(rule.obligations ? { obligations: rule.obligations } : {}),
    };
    const ruleId = `${policyId}_${rule.rule_id}`.slice(0, 64);
    await client.query(
      `INSERT INTO policy_rule (
         rule_id, policy_id, tool_pattern, decision, priority, conditions
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        ruleId,
        policyId,
        rule.tool_pattern,
        rule.decision,
        rule.priority,
        Object.keys(conditions).length > 0 ? JSON.stringify(conditions) : null,
      ],
    );
  }

  for (const wf of pack.workflows) {
    // Org-scoped id: workflow_id is a global PK; a prior demo org must not block
    // demo:fresh from installing executable_params on the new org.
    const orgSuffix = orgId.replace(/-/g, "").slice(0, 8);
    const workflowId = `wf_${pack.id.replace(/\W/g, "_")}_${wf.product}_${orgSuffix}`;
    const executionConfig = {
      ...executionConfigFromPackWorkflow(wf),
      product: wf.product,
    };
    const desc = `pack:${pack.id} product=${wf.product} on_unreachable=${wf.on_unreachable ?? "hold"}`;
    if (force) {
      await client.query(
        `INSERT INTO governed_workflow (
           workflow_id, organization_id, name, description, record_only, execution_config
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (workflow_id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           record_only = EXCLUDED.record_only,
           execution_config = EXCLUDED.execution_config`,
        [
          workflowId,
          orgId,
          wf.name,
          desc,
          Boolean(wf.record_only),
          JSON.stringify(executionConfig),
        ],
      );
    } else {
      await client.query(
        `INSERT INTO governed_workflow (
           workflow_id, organization_id, name, description, record_only, execution_config
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (workflow_id) DO NOTHING`,
        [
          workflowId,
          orgId,
          wf.name,
          desc,
          Boolean(wf.record_only),
          JSON.stringify(executionConfig),
        ],
      );
    }
  }

  // Record pack id + version (+ segment limits) on the tenant.
  await client.query(
    `UPDATE organization
       SET governance_settings =
         COALESCE(governance_settings, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
     WHERE organization_id = $1`,
    [
      orgId,
      JSON.stringify({
        applied_pack: {
          id: pack.id,
          version: pack.version,
          sector: pack.sector,
          applied_at: new Date().toISOString(),
          force,
        },
        ...(Array.isArray(pack.segment_product_limits)
          ? { segment_product_limits: pack.segment_product_limits }
          : {}),
      }),
    ],
  );

  return {
    policyId,
    packId: pack.id,
    packVersion: pack.version,
    combine: pack.combine,
    ruleCount: rules.length,
    escalationRules,
    overwritten: force,
  };
}
