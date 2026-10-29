/**
 * LangGraph-shaped tool + Aegis wrap — produces a Verified receipt without
 * requiring the LangGraph package (honest pattern sample for Phase 4).
 *
 *   cp .env.example .env && fill AEGIS_* from Console
 *   pnpm install && pnpm start
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  GovernanceBridge,
  wrapLangGraphTool,
} from "@salanor/aegis";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2] ?? "";
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} — copy .env.example and fill from Console`);
  return v;
}

async function main() {
  const bridge = new GovernanceBridge({
    apiBaseUrl: requireEnv("AEGIS_API_URL"),
    ingestApiKey: requireEnv("AEGIS_INGEST_API_KEY"),
    organizationId: requireEnv("AEGIS_ORGANIZATION_ID"),
    agentId: requireEnv("AEGIS_AGENT_ID"),
    keyId: requireEnv("AEGIS_KEY_ID"),
    privateKeyB64: requireEnv("AEGIS_PRIVATE_KEY_B64"),
    actorPrincipal: "langgraph-example",
  });

  const lookupBalance = wrapLangGraphTool(bridge, {
    toolName: "banking.balance.lookup",
    description: "Read-only balance check (demo)",
    mapPayload: (input: { account_id: string }) => ({
      account_id: input.account_id,
      amount_usd: 0,
    }),
    handler: async (input) => ({
      account_id: input.account_id,
      balance_usd: 1250.55,
      currency: "USD",
    }),
  });

  let traceId = "";
  const result = await bridge.withTrace(
    {
      triggerSource: "langgraph_example",
      triggerDetail: "examples/langgraph",
      businessContext: "Phase 4 Verified receipt sample",
    },
    async (session) => {
      traceId = session.traceId;
      return lookupBalance({ account_id: "acct_demo_001" });
    },
  );

  const consoleBase = (process.env.AEGIS_CONSOLE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  console.log("Tool result:", result);
  console.log("Trace:", traceId);
  console.log(`Console: ${consoleBase}/aegis/traces/${encodeURIComponent(traceId)}`);
  console.log("Open the case → Verify should pass on a healthy ledger.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
