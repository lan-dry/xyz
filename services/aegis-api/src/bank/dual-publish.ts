/**
 * Dual-approver policy publish (R2.6). Opt-in per policy (dual_publish_required).
 * Default off for existing tenants (D7).
 */

import type pg from "pg";
import { activatePolicy } from "../repo/policies.js";

export type PublishApproval = {
  policy_id: string;
  membership_id: string;
  count: number;
  published: boolean;
};

export async function recordPolicyPublishApproval(
  client: pg.Pool | pg.PoolClient,
  input: {
    organization_id: string;
    policy_id: string;
    membership_id: string;
  },
): Promise<PublishApproval> {
  const pol = await client.query<{
    dual_publish_required: boolean;
    status: string;
  }>(
    `SELECT COALESCE(dual_publish_required, false) AS dual_publish_required, status
     FROM policy
     WHERE organization_id = $1 AND policy_id = $2`,
    [input.organization_id, input.policy_id],
  );
  const row = pol.rows[0];
  if (!row) {
    throw new Error("POLICY_NOT_FOUND");
  }
  if (row.status === "active") {
    throw new Error("POLICY_ALREADY_ACTIVE");
  }

  if (!row.dual_publish_required) {
    await activatePolicy(client, input.organization_id, input.policy_id);
    return {
      policy_id: input.policy_id,
      membership_id: input.membership_id,
      count: 1,
      published: true,
    };
  }

  await client.query(
    `INSERT INTO policy_publish_approval (
       approval_id, policy_id, organization_id, membership_id
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (policy_id, membership_id) DO NOTHING`,
    [
      `ppa_${input.policy_id}_${input.membership_id}`.slice(0, 64),
      input.policy_id,
      input.organization_id,
      input.membership_id,
    ],
  );

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM policy_publish_approval WHERE policy_id = $1`,
    [input.policy_id],
  );
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count >= 2) {
    await activatePolicy(client, input.organization_id, input.policy_id);
    return {
      policy_id: input.policy_id,
      membership_id: input.membership_id,
      count,
      published: true,
    };
  }
  return {
    policy_id: input.policy_id,
    membership_id: input.membership_id,
    count,
    published: false,
  };
}
