import { createServer } from "node:http";
import type { Server } from "node:http";
import type { PilotConfig } from "./config.js";
import {
  attemptPaymentTool,
  createGovernance,
  newTraceId,
  recordAgentDecision,
  recordLlmInvocation,
  recordTicketDataRead,
  finishTraceSession,
  startTraceSession,
} from "./governance.js";
import { runGemini } from "./gemini.js";
import { CONSOLE_ENV_GUIDE, PILOT_TRACE_READING_GUIDE } from "./explain.js";

/** Simulated support ticket — contains PII + financial ask (refund). */
export const SAMPLE_TICKET = {
  ticket_id: "TKT-8842",
  customer_email: "jordan.pilot@example.com",
  order_id: "ORD-2026-4410",
  message:
    "Hi — my AI assistant double-charged my card $249 for the Pro plan. Please refund one charge immediately. Order ORD-2026-4410.",
  refund_amount_usd: 249,
};

export type ScenarioResult = {
  trace_id: string;
  ticket_id: string;
  steps: string[];
  payment_blocked: boolean;
  console_url: string;
};

function startMockPaymentApi(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "payment_created_mock" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("mock payment server failed"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/charge` });
    });
  });
}

/**
 * End-to-end pilot: support AI reads ticket → classifies → tries payment → blocked → safe reply.
 * Every LLM step is signed + ingested with data_touched metadata for console audit.
 */
export async function runSupportRefundScenario(
  config: PilotConfig,
): Promise<ScenarioResult> {
  const traceId = newTraceId();
  const gov = createGovernance(config, traceId);
  const steps: string[] = [];
  const consoleUrl = `http://localhost:3000/aegis/traces/${encodeURIComponent(traceId)}`;

  console.log("\n=== Pilot agent: support refund scenario ===");
  console.log(`Trace ID: ${traceId}`);
  console.log(`Ticket:   ${SAMPLE_TICKET.ticket_id}\n`);

  await startTraceSession(gov, {
    ticketId: SAMPLE_TICKET.ticket_id,
    summary: `Refund request ${SAMPLE_TICKET.refund_amount_usd} for ${SAMPLE_TICKET.order_id}`,
  });
  steps.push("0. trace.start → ingested (chain root + span)");
  console.log(`  ${steps.at(-1)}\n`);

  // Step 1 — classify intent (what data the model sees)
  const classifyPrompt = [
    "Classify this support ticket in one line (intent + risk):",
    `Customer: ${SAMPLE_TICKET.customer_email}`,
    `Order: ${SAMPLE_TICKET.order_id}`,
    `Message: ${SAMPLE_TICKET.message}`,
  ].join("\n");

  const classified = await runGemini(
    config,
    "You are a support triage model. Reply with one short line: intent and whether it involves money/refund.",
    classifyPrompt,
  );

  const classifyEventId = await recordLlmInvocation(gov, {
    toolName: "google.generativeai.classifyIntent",
    purpose: "triage_support_ticket",
    prompt: classifyPrompt,
    response: classified.text,
    dataTouched: ["customer_email", "order_id", "ticket_message", "refund_amount_usd"],
    dataClassification: "pii_financial",
    triggerSource: "support_ticket",
    triggerDetail: SAMPLE_TICKET.ticket_id,
    businessContext: `Triage ticket ${SAMPLE_TICKET.ticket_id}: customer asks for ${SAMPLE_TICKET.refund_amount_usd} refund`,
    riskIfUnmonitored:
      "Without a ledger you cannot prove which PII the model saw or who approved money movement.",
  });
  await recordAgentDecision(gov, {
    decision: classified.text.slice(0, 200),
    rationale: "Gemini triage output determines whether refund workflow proceeds",
    parentEventId: classifyEventId,
  });
  steps.push(`1. classifyIntent + decision → ingested (${classified.mock ? "mock" : "live"} Gemini)`);
  console.log(`  ${steps.at(-1)}`);
  console.log(`     → ${classified.text.slice(0, 120)}\n`);

  // Step 2 — summarize for human reviewer
  const summarizePrompt = `Summarize for a human agent in 2 sentences:\n${SAMPLE_TICKET.message}`;
  const summary = await runGemini(
    config,
    "Summarize support tickets without adding new facts.",
    summarizePrompt,
  );

  await recordLlmInvocation(gov, {
    toolName: "google.generativeai.summarizeTicket",
    purpose: "human_handoff_summary",
    prompt: summarizePrompt,
    response: summary.text,
    dataTouched: ["ticket_message", "order_id"],
    dataClassification: "pii",
    businessContext: `Summarize ticket ${SAMPLE_TICKET.ticket_id} for human review before any refund action`,
    parentEventId: classifyEventId,
    spanId: gov.spans.triage,
    spanLabel: "LLM triage",
  });
  steps.push(`2. summarizeTicket → ingested`);
  console.log(`  ${steps.at(-1)}\n`);

  // Step 3 — agent tries to execute refund via payment API (policy should DENY)
  const { server, url } = await startMockPaymentApi();
  let paymentBlocked = false;
  try {
    const outcome = await attemptPaymentTool(gov, {
      amountUsd: SAMPLE_TICKET.refund_amount_usd,
      customerEmail: SAMPLE_TICKET.customer_email,
      orderId: SAMPLE_TICKET.order_id,
      upstreamUrl: url,
      triggerSource: "llm_refund_workflow",
      triggerReason: `After classifying ticket ${SAMPLE_TICKET.ticket_id} as refund-related`,
    });
    paymentBlocked = outcome.outcome === "denied";
    steps.push(
      paymentBlocked
        ? "3. stripe.paymentIntents.create → BLOCKED by policy (no payment sent)"
        : "3. stripe.paymentIntents.create → ALLOWED (no deny policy on this org)",
    );
    console.log(`  ${steps.at(-1)}`);
    if (!paymentBlocked) {
      console.warn(
        "\n  ⚠ Payment was NOT blocked. Fix: pnpm pilot:ensure-policy   then run pilot:agent again.",
      );
      console.warn(
        "    Or Console → Policies → active rule denying stripe.paymentIntents.create\n",
      );
    } else {
      console.log("");
    }
  } finally {
    server.close();
  }

  // Step 4 — safe customer-facing reply (no payment action)
  const replyPrompt = [
    "Draft a short empathetic reply. Do NOT promise refund is processed — say billing team will review.",
    `Ticket: ${SAMPLE_TICKET.message}`,
  ].join("\n");

  const reply = await runGemini(
    config,
    "You are a support copilot. Never claim a refund was executed.",
    replyPrompt,
  );

  await recordLlmInvocation(gov, {
    toolName: "google.generativeai.draftSafeReply",
    purpose: "customer_response_draft",
    prompt: replyPrompt,
    response: reply.text,
    dataTouched: ["customer_email", "ticket_message"],
    dataClassification: "pii",
    businessContext: `Draft customer reply after payment was blocked for ticket ${SAMPLE_TICKET.ticket_id}`,
    spanId: gov.spans.reply,
    spanLabel: "Safe customer reply",
  });
  steps.push(`4. draftSafeReply → ingested (safe path)`);
  console.log(`  ${steps.at(-1)}`);
  console.log(`     → ${reply.text.slice(0, 120)}…\n`);

  await finishTraceSession(gov, {
    summary: paymentBlocked
      ? `Refund workflow ended safely; $${SAMPLE_TICKET.refund_amount_usd} payment blocked by policy`
      : `Refund workflow finished (payment not blocked — check policies)`,
    outcome: "ok",
  });
  steps.push("5. trace.complete → trace status COMPLETED in Console");
  console.log(`  ${steps.at(-1)}\n`);

  console.log("=== Done ===");
  console.log(`Open traces: ${consoleUrl}`);
  console.log("\n--- How this trace explains AI behaviour ---");
  PILOT_TRACE_READING_GUIDE.forEach((line, i) => console.log(`${i + 1}. ${line}`));
  if (paymentBlocked) {
    console.log(
      `4. This run BLOCKED $${SAMPLE_TICKET.refund_amount_usd} refund — policy denied payment; customer got a safe draft only.`,
    );
  } else {
    console.log("4. ⚠ Payment was NOT blocked — run pnpm pilot:ensure-policy, then pilot:agent again.");
  }
  console.log("\n--- Credentials (from Console) ---");
  CONSOLE_ENV_GUIDE.forEach((line) => console.log(`• ${line}`));
  console.log("See docs/INVESTOR_DEMO.md for the full talk track.\n");

  return {
    trace_id: traceId,
    ticket_id: SAMPLE_TICKET.ticket_id,
    steps,
    payment_blocked: paymentBlocked,
    console_url: consoleUrl,
  };
}
