/**
 * Sign and ingest one SensitiveAction JSON file into Aegis.
 *
 *   pnpm send -- examples/loan-decision.json
 *   pnpm send:loan
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signAndIngest } from "@salanor/aegis";

import { loadEnvFile, required } from "./load-env.js";
import { formatReceiptStory } from "./receipt-story.js";
import { sensitiveActionToAps } from "./to-aps.js";
import type { SensitiveAction } from "./types.js";

loadEnvFile();

const fileArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!fileArg) {
  console.error("Usage: pnpm send -- <path-to-action.json>");
  process.exit(1);
}

const filePath = resolve(process.cwd(), fileArg);
const action = JSON.parse(readFileSync(filePath, "utf8")) as SensitiveAction;

if (!action.action || !action.resource || !Array.isArray(action.fields_accessed)) {
  console.error("Invalid SensitiveAction: need action, resource, and fields_accessed.");
  process.exit(1);
}
if (!action.policy?.id || !action.policy?.reason || !action.outcome || !action.summary) {
  console.error("Invalid SensitiveAction: need policy.id, policy.reason, outcome, and summary.");
  process.exit(1);
}

const apiBaseUrl = required("AEGIS_API_URL");
const ingestApiKey = required("AEGIS_INGEST_API_KEY");
const organizationId = required("AEGIS_ORGANIZATION_ID");
const agentId = required("AEGIS_AGENT_ID");
const keyId = required("AEGIS_KEY_ID");
const privateKeyB64 = required("AEGIS_SIGNING_PRIVATE_KEY_B64");
const consoleBase = (
  process.env.AEGIS_CONSOLE_URL?.trim() || "https://app.salanor.com"
).replace(/\/$/, "");

const { traceId, events } = sensitiveActionToAps(action, {
  organizationId,
  agentId,
  keyId,
});

const sign = { privateKeyB64, keyId };
const ingest = { apiBaseUrl, ingestApiKey };

console.error(`POST ${apiBaseUrl} org=${organizationId} agent=${agentId}`);
console.error(`Case: ${action.action} → ${action.outcome}`);

let lastSequence: number | undefined;
for (const event of events) {
  const result = await signAndIngest(event, sign, {
    ...ingest,
    idempotencyKey: `sensitive-${event.event_id}`,
  });
  lastSequence = result.sequence_num;
}

const receipt = `${consoleBase}/aegis/traces/${encodeURIComponent(traceId)}`;

console.log("\n--- Receipt (plain language) ---\n");
console.log(formatReceiptStory(action));
console.log("\n--- Sealed in Aegis ---\n");
console.log(
  JSON.stringify(
    {
      ok: true,
      trace_id: traceId,
      receipt,
      events: events.length,
      sequence_num: lastSequence,
    },
    null,
    2,
  ),
);
