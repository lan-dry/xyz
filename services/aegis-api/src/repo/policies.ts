import { randomUUID } from "node:crypto";
import type pg from "pg";
import { policyContentHash } from "../bank/policy-hash.js";

export type PolicyRow = {
  policy_id: string;
  organization_id: string;
  name: string;
  version: number;
  rego_source: string | null;
  wasm_artifact: Buffer | null;
  status: string;
  environment?: string;
  combine?: string;
  content_hash?: string | null;
  dual_publish_required?: boolean;
  activated_at: Date | null;
  created_at: Date;
};

export class PolicyImmutableError extends Error {
  constructor(message = "Published policy cannot be modified") {
    super(message);
    this.name = "PolicyImmutableError";
  }
}

async function logPolicyGuard(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  action: string,
  policyId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO audit_log (organization_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'policy', $3, $4::jsonb)`,
      [organizationId, action, policyId, JSON.stringify(detail)],
    );
  } catch {
    // audit_log shape may vary; never block the refusal path
  }
}

export type PolicyRuleRow = {
  rule_id: string;
  policy_id: string;
  tool_pattern: string;
  decision: string;
  priority: number;
  conditions: unknown | null;
};

export async function listPoliciesByOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment?: "production" | "sandbox",
): Promise<PolicyRow[]> {
  const result = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status,
            COALESCE(environment, 'production') AS environment,
            activated_at, created_at
     FROM policy
     WHERE organization_id = $1
       AND ($2::text IS NULL OR COALESCE(environment, 'production') = $2)
     ORDER BY created_at DESC`,
    [organizationId, environment ?? null],
  );
  return result.rows;
}

export async function getPolicyWithRules(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  policyId: string,
): Promise<{ policy: PolicyRow; rules: PolicyRuleRow[] } | null> {
  const policyResult = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status, activated_at, created_at
     FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId],
  );
  const policy = policyResult.rows[0];
  if (!policy) {
    return null;
  }
  const rulesResult = await client.query<PolicyRuleRow>(
    `SELECT rule_id, policy_id, tool_pattern, decision, priority, conditions
     FROM policy_rule WHERE policy_id = $1 ORDER BY priority DESC`,
    [policyId],
  );
  return { policy, rules: rulesResult.rows };
}

export async function getActivePoliciesWithRules(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment?: "production" | "sandbox",
): Promise<Array<{ policy: PolicyRow; rules: PolicyRuleRow[] }>> {
  const policyResult = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status,
            COALESCE(environment, 'production') AS environment,
            COALESCE(combine, 'top_priority') AS combine,
            content_hash,
            activated_at, created_at
     FROM policy
     WHERE organization_id = $1 AND status = 'active'
       AND ($2::text IS NULL OR COALESCE(environment, 'production') = $2)
     ORDER BY activated_at DESC NULLS LAST`,
    [organizationId, environment ?? null],
  );

  if (policyResult.rows.length === 0) return [];

  // One rules query for all active policies (avoids N+1 round-trips).
  const policyIds = policyResult.rows.map((p) => p.policy_id);
  const rulesResult = await client.query<PolicyRuleRow>(
    `SELECT rule_id, policy_id, tool_pattern, decision, priority, conditions
     FROM policy_rule
     WHERE policy_id = ANY($1::text[])
     ORDER BY priority DESC`,
    [policyIds],
  );
  const rulesByPolicy = new Map<string, PolicyRuleRow[]>();
  for (const rule of rulesResult.rows) {
    const list = rulesByPolicy.get(rule.policy_id) ?? [];
    list.push(rule);
    rulesByPolicy.set(rule.policy_id, list);
  }

  return policyResult.rows.map((policy) => ({
    policy,
    rules: rulesByPolicy.get(policy.policy_id) ?? [],
  }));
}

/** @deprecated Prefer getActivePoliciesWithRules — kept for callers expecting one bundle. */
export async function getActivePolicyWithRules(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ policy: PolicyRow; rules: PolicyRuleRow[] } | null> {
  const actives = await getActivePoliciesWithRules(client, organizationId);
  return actives[0] ?? null;
}

export type CreatePolicyInput = {
  name: string;
  rego_source?: string | null;
  environment?: "production" | "sandbox";
  rules: Array<{
    tool_pattern: string;
    decision: string;
    priority?: number;
    conditions?: Record<string, unknown> | null;
  }>;
};

export async function createPolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  userId: string | null,
  input: CreatePolicyInput,
): Promise<{ policy: PolicyRow; rules: PolicyRuleRow[] }> {
  const environment = input.environment === "sandbox" ? "sandbox" : "production";
  const versionResult = await client.query<{ max: string | null }>(
    `SELECT MAX(version)::text AS max FROM policy
     WHERE organization_id = $1 AND name = $2
       AND COALESCE(environment, 'production') = $3`,
    [organizationId, input.name, environment],
  );
  const version = Number(versionResult.rows[0]?.max ?? 0) + 1;
  const policyId = `pol_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const inserted = await client.query<PolicyRow>(
    `INSERT INTO policy (
       policy_id, organization_id, name, version, rego_source, status, created_by, environment
     ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
     RETURNING policy_id, organization_id, name, version, rego_source,
               wasm_artifact, status,
               COALESCE(environment, 'production') AS environment,
               activated_at, created_at`,
    [
      policyId,
      organizationId,
      input.name,
      version,
      input.rego_source ?? null,
      userId,
      environment,
    ],
  );

  const rules: PolicyRuleRow[] = [];
  for (const rule of input.rules) {
    const ruleId = `rule_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const row = await client.query<PolicyRuleRow>(
      `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING rule_id, policy_id, tool_pattern, decision, priority, conditions`,
      [
        ruleId,
        policyId,
        rule.tool_pattern,
        rule.decision,
        rule.priority ?? 0,
        rule.conditions ? JSON.stringify(rule.conditions) : null,
      ],
    );
    rules.push(row.rows[0]!);
  }

  return { policy: inserted.rows[0]!, rules };
}

export async function activatePolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  policyId: string,
): Promise<PolicyRow | null> {
  const check = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status,
            COALESCE(combine, 'top_priority') AS combine,
            content_hash, activated_at, created_at
     FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId],
  );
  const policy = check.rows[0];
  if (!policy) {
    return null;
  }

  const rulesResult = await client.query<PolicyRuleRow>(
    `SELECT rule_id, policy_id, tool_pattern, decision, priority, conditions
     FROM policy_rule WHERE policy_id = $1 ORDER BY priority DESC`,
    [policyId],
  );
  const contentHash = policyContentHash({
    policy_id: policy.policy_id,
    name: policy.name,
    version: policy.version,
    combine: policy.combine ?? "top_priority",
    rules: rulesResult.rows.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions,
    })),
  });

  const updated = await client.query<PolicyRow>(
    `UPDATE policy
     SET status = 'active', activated_at = now(), content_hash = $2
     WHERE policy_id = $1
     RETURNING policy_id, organization_id, name, version, rego_source,
               wasm_artifact, status,
               COALESCE(combine, 'top_priority') AS combine,
               content_hash, activated_at, created_at`,
    [policyId, contentHash],
  );
  return updated.rows[0] ?? null;
}

export async function updateDraftPolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  policyId: string,
  input: CreatePolicyInput,
): Promise<{ policy: PolicyRow; rules: PolicyRuleRow[] } | null> {
  const check = await client.query<{ status: string }>(
    `SELECT status FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId],
  );
  const row = check.rows[0];
  if (!row) return null;
  if (row.status !== "draft") {
    await logPolicyGuard(client, organizationId, "policy.update_refused", policyId, {
      status: row.status,
      reason: "published_immutable",
    });
    throw new PolicyImmutableError();
  }

  await client.query(
    `UPDATE policy SET name = $3, rego_source = $4
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId, input.name, input.rego_source ?? null],
  );

  await client.query(`DELETE FROM policy_rule WHERE policy_id = $1`, [policyId]);

  const rules: PolicyRuleRow[] = [];
  for (const rule of input.rules) {
    const ruleId = `rule_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const inserted = await client.query<PolicyRuleRow>(
      `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING rule_id, policy_id, tool_pattern, decision, priority, conditions`,
      [
        ruleId,
        policyId,
        rule.tool_pattern,
        rule.decision,
        rule.priority ?? 0,
        rule.conditions ? JSON.stringify(rule.conditions) : null,
      ],
    );
    rules.push(inserted.rows[0]!);
  }

  const policyResult = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status, activated_at, created_at
     FROM policy WHERE policy_id = $1`,
    [policyId],
  );
  return { policy: policyResult.rows[0]!, rules };
}

export async function deleteDraftPolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  policyId: string,
): Promise<boolean> {
  const check = await client.query<{ status: string }>(
    `SELECT status FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId],
  );
  const row = check.rows[0];
  if (!row) return false;
  if (row.status !== "draft") {
    await logPolicyGuard(client, organizationId, "policy.delete_refused", policyId, {
      status: row.status,
      reason: "published_immutable",
    });
    throw new PolicyImmutableError();
  }
  const result = await client.query(
    `DELETE FROM policy
     WHERE organization_id = $1 AND policy_id = $2 AND status = 'draft'`,
    [organizationId, policyId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Retire the active policy without activating a replacement. */
export async function archivePolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  policyId: string,
): Promise<PolicyRow | null> {
  const result = await client.query<PolicyRow>(
    `UPDATE policy
     SET status = 'archived', activated_at = NULL
     WHERE organization_id = $1 AND policy_id = $2 AND status = 'active'
     RETURNING policy_id, organization_id, name, version, rego_source,
               wasm_artifact, status, activated_at, created_at`,
    [organizationId, policyId],
  );
  return result.rows[0] ?? null;
}
