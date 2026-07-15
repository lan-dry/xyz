import { randomUUID } from "node:crypto";
import type pg from "pg";

export type PolicyRow = {
  policy_id: string;
  organization_id: string;
  name: string;
  version: number;
  rego_source: string | null;
  wasm_artifact: Buffer | null;
  status: string;
  activated_at: Date | null;
  created_at: Date;
};

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
): Promise<PolicyRow[]> {
  const result = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status, activated_at, created_at
     FROM policy
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
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

export async function getActivePolicyWithRules(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ policy: PolicyRow; rules: PolicyRuleRow[] } | null> {
  const policyResult = await client.query<PolicyRow>(
    `SELECT policy_id, organization_id, name, version, rego_source,
            wasm_artifact, status, activated_at, created_at
     FROM policy
     WHERE organization_id = $1 AND status = 'active'
     ORDER BY activated_at DESC NULLS LAST
     LIMIT 1`,
    [organizationId],
  );
  const policy = policyResult.rows[0];
  if (!policy) {
    return null;
  }
  const rulesResult = await client.query<PolicyRuleRow>(
    `SELECT rule_id, policy_id, tool_pattern, decision, priority
     FROM policy_rule WHERE policy_id = $1 ORDER BY priority DESC`,
    [policy.policy_id],
  );
  return { policy, rules: rulesResult.rows };
}

export type CreatePolicyInput = {
  name: string;
  rego_source?: string | null;
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
  const versionResult = await client.query<{ max: string | null }>(
    `SELECT MAX(version)::text AS max FROM policy
     WHERE organization_id = $1 AND name = $2`,
    [organizationId, input.name],
  );
  const version = Number(versionResult.rows[0]?.max ?? 0) + 1;
  const policyId = `pol_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const inserted = await client.query<PolicyRow>(
    `INSERT INTO policy (
       policy_id, organization_id, name, version, rego_source, status, created_by
     ) VALUES ($1, $2, $3, $4, $5, 'draft', $6)
     RETURNING policy_id, organization_id, name, version, rego_source,
               wasm_artifact, status, activated_at, created_at`,
    [
      policyId,
      organizationId,
      input.name,
      version,
      input.rego_source ?? null,
      userId,
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
            wasm_artifact, status, activated_at, created_at
     FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [organizationId, policyId],
  );
  const policy = check.rows[0];
  if (!policy) {
    return null;
  }

  await client.query(
    `UPDATE policy SET status = 'archived'
     WHERE organization_id = $1 AND status = 'active' AND policy_id <> $2`,
    [organizationId, policyId],
  );

  const updated = await client.query<PolicyRow>(
    `UPDATE policy
     SET status = 'active', activated_at = now()
     WHERE policy_id = $1
     RETURNING policy_id, organization_id, name, version, rego_source,
               wasm_artifact, status, activated_at, created_at`,
    [policyId],
  );
  return updated.rows[0] ?? null;
}
