/**
 * Minimal Governance Bridge example — any Node 18+ client.
 *
 * Usage:
 *   cp .env.example .env   # fill AEGIS_* from console
 *   pnpm install
 *   pnpm start
 */
import {
  AEGIS_TRACE_ID_HEADER,
  getGovernanceBridgeSingleton,
  safeGovernance,
  withOptionalTrace,
} from "@salanor/aegis";

async function simulateLlmCall(session: { recordLlm: (input: unknown) => Promise<string> } | null) {
  const prompt = "Summarize the quarterly report in three bullets.";
  const response = "• Revenue up 12%\n• Churn down\n• Two new enterprise deals";

  if (session) {
    await safeGovernance("recordLlm", () =>
      session.recordLlm({
        toolName: "openai.chat.completions",
        purpose: "quarterly_summary",
        prompt,
        response,
        dataTouched: ["reports/q3.pdf"],
        payload: { model: "gpt-4o-mini", provider: "openai" },
      }),
    );
  }

  return response;
}

async function main() {
  const bridge = getGovernanceBridgeSingleton(process.env);

  const { result, traceId, traceUrl } = await withOptionalTrace(
    bridge,
    {
      triggerSource: "example_job",
      triggerDetail: "governance-bridge-node/demo",
      businessContext: "Partner onboarding smoke test",
    },
    async (session) => {
      if (session) {
        await safeGovernance("recordDataAccess", () =>
          session.recordDataAccess({
            operation: "read",
            resource: "reports",
            fields: ["q3.pdf"],
            classification: "internal",
          }),
        );
      }

      const summary = await simulateLlmCall(session);

      if (session) {
        await safeGovernance("recordDecision", () =>
          session.recordDecision({
            decision: "complete",
            rationale: "Generated executive summary for Q3 report.",
          }),
        );
      }

      return { summary };
    },
    { consoleUrl: process.env.AEGIS_CONSOLE_URL },
  );

  console.log("Result:", result.summary.slice(0, 60) + "...");
  if (traceId) {
    console.log(`${AEGIS_TRACE_ID_HEADER}: ${traceId}`);
    if (traceUrl) console.log(`Console: ${traceUrl}`);
  } else {
    console.log("Aegis disabled (set AEGIS_ENABLED=1 and credentials in .env)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
