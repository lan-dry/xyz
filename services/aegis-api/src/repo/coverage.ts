import type pg from "pg";
import { toolMatches } from "../policy/match.js";

export type CoverageToolRow = {
  tool_name: string;
  governed: boolean;
  source: "event" | "declared" | "both";
  event_count: number;
  matched_patterns: string[];
  agent_ids: string[];
};

export type CoverageReport = {
  environment: "production" | "sandbox";
  governed_count: number;
  ungoverned_count: number;
  tools: CoverageToolRow[];
};

function parseDeclaredTools(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

/** Ensure demo orgs always show at least one intentionally ungoverned tool. */
export async function ensureDemoUngovernedTool(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox",
): Promise<void> {
  const DEMO_TOOL = "demo.shadow_transfer";
  const agents = await client.query<{ agent_id: string; declared_tools: unknown }>(
    `SELECT agent_id, declared_tools FROM agent
     WHERE organization_id = $1
       AND COALESCE(environment, 'production') = $2
     ORDER BY created_at ASC
     LIMIT 5`,
    [organizationId, environment],
  );
  if (agents.rows.length === 0) return;

  const already = agents.rows.some((a) =>
    parseDeclaredTools(a.declared_tools).includes(DEMO_TOOL),
  );
  if (already) return;

  const target = agents.rows[0]!;
  const next = [...parseDeclaredTools(target.declared_tools), DEMO_TOOL];
  await client.query(
    `UPDATE agent SET declared_tools = $1::jsonb WHERE agent_id = $2 AND organization_id = $3`,
    [JSON.stringify(next), target.agent_id, organizationId],
  );
}

export async function getToolCoverage(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<CoverageReport> {
  await ensureDemoUngovernedTool(client, organizationId, environment);

  const patternsResult = await client.query<{ tool_pattern: string }>(
    `SELECT DISTINCT pr.tool_pattern
     FROM policy_rule pr
     JOIN policy p ON p.policy_id = pr.policy_id
     WHERE p.organization_id = $1
       AND p.status = 'active'
       AND COALESCE(p.environment, 'production') = $2`,
    [organizationId, environment],
  );
  const patterns = patternsResult.rows.map((r) => r.tool_pattern);

  const eventTools = await client.query<{
    tool_name: string;
    event_count: string;
    agent_ids: string[];
  }>(
    `SELECT e.tool_name,
            COUNT(*)::text AS event_count,
            array_agg(DISTINCT e.agent_id) AS agent_ids
     FROM event e
     WHERE e.organization_id = $1
       AND e.tool_name IS NOT NULL
       AND e.tool_name <> ''
       AND e.emitted_at >= now() - interval '90 days'
       AND COALESCE(
         (SELECT a.environment FROM agent a
          WHERE a.agent_id = e.agent_id AND a.organization_id = e.organization_id),
         'production'
       ) = $2
     GROUP BY e.tool_name`,
    [organizationId, environment],
  );

  const declared = await client.query<{
    agent_id: string;
    declared_tools: unknown;
  }>(
    `SELECT agent_id, declared_tools FROM agent
     WHERE organization_id = $1
       AND COALESCE(environment, 'production') = $2`,
    [organizationId, environment],
  );

  type Acc = {
    tool_name: string;
    event_count: number;
    agent_ids: Set<string>;
    fromEvent: boolean;
    fromDeclared: boolean;
  };
  const byTool = new Map<string, Acc>();

  for (const row of eventTools.rows) {
    byTool.set(row.tool_name, {
      tool_name: row.tool_name,
      event_count: Number(row.event_count),
      agent_ids: new Set(row.agent_ids ?? []),
      fromEvent: true,
      fromDeclared: false,
    });
  }

  for (const row of declared.rows) {
    for (const tool of parseDeclaredTools(row.declared_tools)) {
      const existing = byTool.get(tool);
      if (existing) {
        existing.fromDeclared = true;
        existing.agent_ids.add(row.agent_id);
      } else {
        byTool.set(tool, {
          tool_name: tool,
          event_count: 0,
          agent_ids: new Set([row.agent_id]),
          fromEvent: false,
          fromDeclared: true,
        });
      }
    }
  }

  const tools: CoverageToolRow[] = [...byTool.values()]
    .map((acc) => {
      const matched = patterns.filter((p) => toolMatches(p, acc.tool_name));
      const source: CoverageToolRow["source"] =
        acc.fromEvent && acc.fromDeclared
          ? "both"
          : acc.fromDeclared
            ? "declared"
            : "event";
      return {
        tool_name: acc.tool_name,
        governed: matched.length > 0,
        source,
        event_count: acc.event_count,
        matched_patterns: matched,
        agent_ids: [...acc.agent_ids],
      };
    })
    .sort((a, b) => {
      if (a.governed !== b.governed) return a.governed ? 1 : -1;
      return a.tool_name.localeCompare(b.tool_name);
    });

  return {
    environment,
    governed_count: tools.filter((t) => t.governed).length,
    ungoverned_count: tools.filter((t) => !t.governed).length,
    tools,
  };
}
