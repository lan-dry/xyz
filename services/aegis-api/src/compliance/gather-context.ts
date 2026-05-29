import type pg from "pg";

export type ExportContext = {
  policies: unknown[];
  approvals: unknown[];
  auditLog: unknown[];
  witnessRoots: unknown[];
  inclusionProofs: unknown[];
};

export async function gatherExportContext(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ExportContext> {
  const [policies, approvals, auditLog, witnessRoots, inclusionProofs] =
    await Promise.all([
      client
        .query(
          `SELECT p.policy_id, p.name, p.version, p.status, p.activated_at, p.created_at,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'rule_id', pr.rule_id,
                        'tool_pattern', pr.tool_pattern,
                        'decision', pr.decision,
                        'priority', pr.priority,
                        'conditions', pr.conditions
                      )
                      ORDER BY pr.priority DESC
                    ) FILTER (WHERE pr.rule_id IS NOT NULL),
                    '[]'::json
                  ) AS rules
           FROM policy p
           LEFT JOIN policy_rule pr ON pr.policy_id = p.policy_id
           WHERE p.organization_id = $1
           GROUP BY p.policy_id
           ORDER BY p.created_at DESC`,
          [organizationId],
        )
        .then((r) => r.rows),

      client
        .query(
          `SELECT a.approval_id, a.event_id, a.status, a.channel_type,
                  a.approver_user_id, a.expires_at, a.decided_at, a.created_at,
                  e.trace_id, e.emitted_at, e.tool_name, e.policy_decision
           FROM approval a
           JOIN event e ON e.event_id = a.event_id
           WHERE a.organization_id = $1
             AND e.emitted_at >= $2
             AND e.emitted_at <= $3
           ORDER BY a.created_at ASC`,
          [organizationId, periodStart, periodEnd],
        )
        .then((r) => r.rows),

      client
        .query(
          `SELECT audit_id, user_id, action, resource_type, resource_id,
                  metadata, created_at
           FROM audit_log
           WHERE organization_id = $1
             AND created_at >= $2
             AND created_at <= $3
           ORDER BY created_at ASC`,
          [organizationId, periodStart, periodEnd],
        )
        .then((r) => r.rows),

      client
        .query(
          `SELECT root_id, root_hash, tree_size, interval_start, interval_end,
                  sig_value_b64, sig_key_id, anchoring_type, external_tx_id,
                  published, published_at
           FROM merkle_root
           WHERE organization_id = $1
             AND interval_end >= $2
             AND interval_start <= $3
           ORDER BY interval_end DESC`,
          [organizationId, periodStart, periodEnd],
        )
        .then((r) => r.rows),

      client
        .query(
          `SELECT p.proof_id, p.event_id, p.root_id, p.merkle_path, p.leaf_index,
                  p.generated_at, r.root_hash, r.tree_size
           FROM inclusion_proof p
           JOIN merkle_root r ON r.root_id = p.root_id
           JOIN event e ON e.event_id = p.event_id
           WHERE p.organization_id = $1
             AND e.emitted_at >= $2
             AND e.emitted_at <= $3
           ORDER BY p.generated_at ASC`,
          [organizationId, periodStart, periodEnd],
        )
        .then((r) => r.rows),
    ]);

  return { policies, approvals, auditLog, witnessRoots, inclusionProofs };
}
