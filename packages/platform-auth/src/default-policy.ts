import { randomUUID } from "node:crypto";
import type pg from "pg";

/** Pilot-safe default: deny Stripe payment creation until customer defines their own policy. */
export async function seedDefaultDenyPolicy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  organizationSlug: string,
  defaultAgentId: string,
): Promise<string> {
  const slugPart = organizationSlug.replace(/[^a-z0-9-]/g, "-").slice(0, 24);
  const policyId = `pol_${slugPart}_${organizationId.replace(/-/g, "").slice(0, 8)}`;
  const ruleId = `rule_deny_stripe_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Default', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET status = 'active', activated_at = now()`,
    [policyId, organizationId],
  );

  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority)
     VALUES ($1, $2, 'stripe.paymentIntents.create', 'deny', 100)
     ON CONFLICT (rule_id) DO UPDATE SET
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority`,
    [ruleId, policyId],
  );

  await client.query(
    `UPDATE agent SET default_policy_id = $2 WHERE agent_id = $1 AND organization_id = $3`,
    [defaultAgentId, policyId, organizationId],
  );

  return policyId;
}
