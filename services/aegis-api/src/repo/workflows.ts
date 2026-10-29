import { randomUUID } from "node:crypto";
import type pg from "pg";

export type GovernedWorkflow = {
  workflow_id: string;
  organization_id: string;
  environment: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  policy_ids: string[];
  external_ref: string | null;
  fail_mode: "fail_closed" | "fail_open_buffer";
  created_at: Date;
  updated_at: Date;
};

function parseFailMode(raw: unknown): "fail_closed" | "fail_open_buffer" {
  return raw === "fail_open_buffer" ? "fail_open_buffer" : "fail_closed";
}

function parsePolicyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export async function listWorkflows(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment?: "production" | "sandbox",
): Promise<GovernedWorkflow[]> {
  const result = await client.query<{
    workflow_id: string;
    organization_id: string;
    environment: string;
    name: string;
    description: string | null;
    agent_id: string | null;
    policy_ids: unknown;
    external_ref: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT * FROM governed_workflow
     WHERE organization_id = $1
       AND ($2::text IS NULL OR environment = $2)
     ORDER BY created_at ASC`,
    [organizationId, environment ?? null],
  );
  return result.rows.map((row) => ({
    ...row,
    policy_ids: parsePolicyIds(row.policy_ids),
    fail_mode: parseFailMode((row as { fail_mode?: string }).fail_mode),
  }));
}

export async function getWorkflow(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  workflowId: string,
): Promise<GovernedWorkflow | null> {
  const result = await client.query(
    `SELECT * FROM governed_workflow
     WHERE organization_id = $1 AND workflow_id = $2`,
    [organizationId, workflowId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    policy_ids: parsePolicyIds(row.policy_ids),
    fail_mode: parseFailMode(row.fail_mode),
  };
}

export async function createWorkflow(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    environment: "production" | "sandbox";
    name: string;
    description?: string | null;
    agentId?: string | null;
    policyIds?: string[];
    externalRef?: string | null;
    failMode?: "fail_closed" | "fail_open_buffer";
  },
): Promise<GovernedWorkflow> {
  const workflowId = `wf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const failMode = params.failMode === "fail_open_buffer" ? "fail_open_buffer" : "fail_closed";
  const result = await client.query(
    `INSERT INTO governed_workflow (
       workflow_id, organization_id, environment, name, description,
       agent_id, policy_ids, external_ref, fail_mode
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING *`,
    [
      workflowId,
      params.organizationId,
      params.environment,
      params.name.trim(),
      params.description?.trim() || null,
      params.agentId?.trim() || null,
      JSON.stringify(params.policyIds ?? []),
      params.externalRef?.trim() || null,
      failMode,
    ],
  );
  const row = result.rows[0];
  return {
    ...row,
    policy_ids: parsePolicyIds(row.policy_ids),
    fail_mode: parseFailMode(row.fail_mode),
  };
}

export async function updateWorkflow(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  workflowId: string,
  patch: {
    name?: string;
    description?: string | null;
    agentId?: string | null;
    policyIds?: string[];
    externalRef?: string | null;
    failMode?: "fail_closed" | "fail_open_buffer";
  },
): Promise<GovernedWorkflow | null> {
  const current = await getWorkflow(client, organizationId, workflowId);
  if (!current) return null;
  const failMode =
    patch.failMode !== undefined
      ? patch.failMode === "fail_open_buffer"
        ? "fail_open_buffer"
        : "fail_closed"
      : current.fail_mode;
  const result = await client.query(
    `UPDATE governed_workflow SET
       name = $1,
       description = $2,
       agent_id = $3,
       policy_ids = $4::jsonb,
       external_ref = $5,
       fail_mode = $6,
       updated_at = now()
     WHERE organization_id = $7 AND workflow_id = $8
     RETURNING *`,
    [
      patch.name?.trim() ?? current.name,
      patch.description !== undefined
        ? patch.description?.trim() || null
        : current.description,
      patch.agentId !== undefined ? patch.agentId?.trim() || null : current.agent_id,
      JSON.stringify(patch.policyIds ?? current.policy_ids),
      patch.externalRef !== undefined
        ? patch.externalRef?.trim() || null
        : current.external_ref,
      failMode,
      organizationId,
      workflowId,
    ],
  );
  const row = result.rows[0];
  return {
    ...row,
    policy_ids: parsePolicyIds(row.policy_ids),
    fail_mode: parseFailMode(row.fail_mode),
  };
}

/** Coverage + evidence readiness for a workflow (0–100). */
export async function workflowScores(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  workflow: GovernedWorkflow,
): Promise<{ coverage_pct: number; evidence_readiness_pct: number }> {
  let coverage = 40;
  if (workflow.agent_id) {
    const agent = await client.query<{ active: boolean; default_policy_id: string | null }>(
      `SELECT active, default_policy_id FROM agent
       WHERE organization_id = $1 AND agent_id = $2`,
      [organizationId, workflow.agent_id],
    );
    if (agent.rows[0]?.active) coverage += 30;
    if (agent.rows[0]?.default_policy_id || workflow.policy_ids.length > 0) {
      coverage += 30;
    }
  }

  const unverified = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event e
     WHERE e.organization_id = $1
       AND ($2::text IS NULL OR e.agent_id = $2)
       AND e.chain_valid = false`,
    [organizationId, workflow.agent_id],
  );
  const bad = Number(unverified.rows[0]?.count ?? 0);
  const pendingWitness = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event e
     WHERE e.organization_id = $1
       AND ($2::text IS NULL OR e.agent_id = $2)
       AND NOT EXISTS (SELECT 1 FROM inclusion_proof p WHERE p.event_id = e.event_id)`,
    [organizationId, workflow.agent_id],
  );
  const pending = Number(pendingWitness.rows[0]?.count ?? 0);
  let evidence = 100;
  if (bad > 0) evidence -= Math.min(60, bad * 10);
  if (pending > 0) evidence -= Math.min(30, pending);

  return {
    coverage_pct: Math.min(100, coverage),
    evidence_readiness_pct: Math.max(0, evidence),
  };
}

/** Seed Merchant payouts workflow for Northwind-style orgs when missing. */
export async function ensureMerchantPayoutsWorkflow(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<GovernedWorkflow> {
  const existing = await client.query<{ workflow_id: string }>(
    `SELECT workflow_id FROM governed_workflow
     WHERE organization_id = $1 AND environment = $2 AND name = $3
     LIMIT 1`,
    [organizationId, environment, "Merchant payouts"],
  );
  if (existing.rows[0]) {
    const wf = await getWorkflow(client, organizationId, existing.rows[0].workflow_id);
    if (wf) return wf;
  }

  const payoutAgent = await client.query<{ agent_id: string }>(
    `SELECT agent_id FROM agent
     WHERE organization_id = $1
       AND (agent_id ILIKE '%payout%' OR slug ILIKE '%payout%')
     ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  const policies = await client.query<{ policy_id: string }>(
    `SELECT policy_id FROM policy
     WHERE organization_id = $1 AND status = 'active'
       AND (name ILIKE '%payout%' OR name ILIKE '%merchant%')
     ORDER BY activated_at DESC NULLS LAST
     LIMIT 3`,
    [organizationId],
  );

  return createWorkflow(client, {
    organizationId,
    environment,
    name: "Merchant payouts",
    description:
      "Governed payout path: agent → policy pause for new merchants → human approve → sealed receipt.",
    agentId: payoutAgent.rows[0]?.agent_id ?? null,
    policyIds: policies.rows.map((r) => r.policy_id),
    externalRef: "northwind.merchant-payouts",
  });
}
