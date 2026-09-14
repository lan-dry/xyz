/** Derive buyer-facing governance insights from APS events. */

export type InsightSeverity = "info" | "attention" | "critical";

export type GovernanceInsight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  metric?: string;
};

export type GovernanceEventInput = {
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  payload: unknown;
};

export type GovernanceInsightsResult = {
  headline: string;
  insights: GovernanceInsight[];
  stats: {
    llm_steps: number;
    policy_evaluations: number;
    tools_denied: number;
    tools_allowed: number;
    obligation_required: number;
    pii_fields: string[];
    data_classifications: string[];
    financial_exposure_usd: number | null;
    unique_tools: string[];
  };
};

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Turn signed events into executive-readable insights (allowed flows too). */
export function buildGovernanceInsights(
  events: GovernanceEventInput[],
): GovernanceInsightsResult {
  const stats = {
    llm_steps: 0,
    policy_evaluations: 0,
    tools_denied: 0,
    tools_allowed: 0,
    obligation_required: 0,
    pii_fields: [] as string[],
    data_classifications: [] as string[],
    financial_exposure_usd: null as number | null,
    unique_tools: [] as string[],
  };

  const insights: GovernanceInsight[] = [];

  for (const e of events) {
    const p = payloadRecord(e.payload);
    if (e.tool_name) {
      stats.unique_tools.push(e.tool_name);
    }

    if (e.action_kind === "llm_invocation") {
      stats.llm_steps += 1;
      const touched = p?.data_touched;
      if (Array.isArray(touched)) {
        for (const field of touched) {
          if (typeof field === "string") stats.pii_fields.push(field);
        }
      }
      const classification = str(p?.data_classification);
      if (classification) stats.data_classifications.push(classification);

      const summary = str(p?.investor_summary) ?? str(p?.business_context);
      if (summary && stats.llm_steps <= 3) {
        insights.push({
          id: `llm-${stats.llm_steps}`,
          severity: classification?.includes("financial") ? "attention" : "info",
          title: `AI step: ${str(p?.purpose) ?? e.tool_name ?? "llm"}`,
          detail: summary,
        });
      }
    }

    if (e.action_kind === "policy_decision") {
      stats.policy_evaluations += 1;
      if (e.policy_decision === "deny") stats.tools_denied += 1;
      if (e.policy_decision === "allow") stats.tools_allowed += 1;
      if (e.policy_decision === "allow_with_obligation") {
        stats.obligation_required += 1;
      }

      const amount = num(p?.amount_usd ?? p?.amount);
      if (amount != null) {
        stats.financial_exposure_usd =
          (stats.financial_exposure_usd ?? 0) + amount;
      }
    }
  }

  stats.pii_fields = uniq(stats.pii_fields);
  stats.data_classifications = uniq(stats.data_classifications);
  stats.unique_tools = uniq(stats.unique_tools);

  if (stats.pii_fields.length > 0) {
    insights.unshift({
      id: "pii-exposure",
      severity: stats.data_classifications.some((c) => c.includes("financial"))
        ? "attention"
        : "info",
      title: "Customer data crossed the AI boundary",
      detail: `Models accessed: ${stats.pii_fields.join(", ")}. Without a signed ledger you cannot prove this to regulators or answer “what did the AI see?” in an incident.`,
      metric: `${stats.pii_fields.length} field type(s)`,
    });
  }

  if (stats.llm_steps > 0) {
    insights.push({
      id: "audit-trail",
      severity: "info",
      title: "Complete model audit trail",
      detail: `${stats.llm_steps} LLM step(s) signed and chained — exportable for SOC 2, EU AI Act, and internal risk review even when nothing was blocked.`,
      metric: String(stats.llm_steps),
    });
  }

  if (stats.tools_denied > 0) {
    insights.unshift({
      id: "prevented-actions",
      severity: "critical",
      title: "High-risk actions stopped before execution",
      detail: `${stats.tools_denied} tool call(s) denied by policy before any outbound API ran. Loss prevention is one benefit — not the only one.`,
      metric: String(stats.tools_denied),
    });
  }

  if (stats.tools_allowed > 0 && stats.financial_exposure_usd != null) {
    insights.push({
      id: "financial-allowed",
      severity: "attention",
      title: "Financial tools executed under policy",
      detail: `$${stats.financial_exposure_usd.toFixed(0)} moved through allowed payment tools. Aegis records policy context and the signed chain if finance or compliance asks later.`,
      metric: `$${stats.financial_exposure_usd.toFixed(0)}`,
    });
  }

  if (stats.obligation_required > 0) {
    insights.push({
      id: "human-loop",
      severity: "attention",
      title: "Human-in-the-loop required",
      detail: `${stats.obligation_required} action(s) need explicit approval before running — separates “AI suggested” from “human authorized”.`,
      metric: String(stats.obligation_required),
    });
  }

  if (events.length === 0) {
    return {
      headline: "No signed activity yet",
      insights: [],
      stats,
    };
  }

  let headline: string;
  if (stats.tools_denied > 0) {
    headline = `Governed workflow: ${stats.tools_denied} risky action(s) blocked, ${stats.llm_steps} AI step(s) on record`;
  } else if (stats.pii_fields.length > 0) {
    headline = `Visible AI activity: ${stats.llm_steps} model call(s) touching ${stats.pii_fields.length} data type(s)`;
  } else {
    headline = `${events.length} signed event(s) — provable record of what your agent did`;
  }

  return { headline, insights: insights.slice(0, 8), stats };
}
