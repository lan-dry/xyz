import type pg from "pg";
import { toolMatches } from "../policy/match.js";

export type PolicyDraftConflict = {
  tool_pattern: string;
  drafts: Array<{ policy_id: string; name: string; decision: string }>;
};

/** Draft policies whose rules target the same tool pattern (exact or overlapping glob). */
export async function listDraftPolicyConflicts(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<PolicyDraftConflict[]> {
  const result = await client.query<{
    policy_id: string;
    name: string;
    tool_pattern: string;
    decision: string;
  }>(
    `SELECT p.policy_id, p.name, r.tool_pattern, r.decision
     FROM policy p
     JOIN policy_rule r ON r.policy_id = p.policy_id
     WHERE p.organization_id = $1 AND p.status = 'draft'
     ORDER BY p.created_at DESC`,
    [organizationId],
  );

  const byPattern = new Map<
    string,
    Array<{ policy_id: string; name: string; decision: string }>
  >();

  for (const row of result.rows) {
    const key = row.tool_pattern.trim();
    const list = byPattern.get(key) ?? [];
    if (!list.some((d) => d.policy_id === row.policy_id)) {
      list.push({
        policy_id: row.policy_id,
        name: row.name,
        decision: row.decision,
      });
    }
    byPattern.set(key, list);
  }

  const exactConflicts: PolicyDraftConflict[] = [];
  for (const [tool_pattern, drafts] of byPattern) {
    if (drafts.length > 1) {
      exactConflicts.push({ tool_pattern, drafts });
    }
  }

  const rows = result.rows;
  const overlapConflicts: PolicyDraftConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.policy_id === b.policy_id) continue;
      if (a.tool_pattern === b.tool_pattern) continue;
      const sampleTools = [a.tool_pattern, b.tool_pattern, "app.payments.transfer"];
      const overlaps = sampleTools.some(
        (tool) =>
          toolMatches(a.tool_pattern, tool) && toolMatches(b.tool_pattern, tool),
      );
      if (!overlaps) continue;
      const key = [a.tool_pattern, b.tool_pattern].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      overlapConflicts.push({
        tool_pattern: `${a.tool_pattern} ↔ ${b.tool_pattern}`,
        drafts: [
          {
            policy_id: a.policy_id,
            name: a.name,
            decision: a.decision,
          },
          {
            policy_id: b.policy_id,
            name: b.name,
            decision: b.decision,
          },
        ],
      });
    }
  }

  return [...exactConflicts, ...overlapConflicts];
}
