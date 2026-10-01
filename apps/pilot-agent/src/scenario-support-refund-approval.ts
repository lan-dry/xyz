import { createServer } from "node:http";
import type { Server } from "node:http";
import type { PilotConfig } from "./config.js";
import {
  attemptPaymentTool,
  createGovernance,
  finishTraceSession,
  newTraceId,
  recordAgentDecision,
  recordLlmInvocation,
  resumePaymentAfterApproval,
  startTraceSession,
} from "./governance.js";
import { runGemini } from "./gemini.js";
import { SAMPLE_TICKET } from "./scenario-support-refund.js";

export type ApprovalPendingResult = {
  mode: "approval_pending";
  trace_id: string;
  approval_id: string;
  ticket_id: string;
  console_trace_url: string;
  console_approvals_url: string;
  steps: string[];
};

export type ApprovalResumeResult = {
  mode: "approval_resumed";
  trace_id: string;
  approval_id: string;
  console_url: string;
  steps: string[];
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

/** Same ticket story, but policy requires human approval before payment. */
export async function runSupportRefundApprovalScenario(
  config: PilotConfig,
): Promise<ApprovalPendingResult> {
  const traceId = newTraceId();
  const gov = createGovernance(config, traceId);
  const steps: string[] = [];

  console.log("\n=== Pilot agent: support refund (human approval) ===");
  console.log(`Trace ID: ${traceId}\n`);

  await startTraceSession(gov, {
    ticketId: SAMPLE_TICKET.ticket_id,
    summary: `Refund request ${SAMPLE_TICKET.refund_amount_usd} for ${SAMPLE_TICKET.order_id}`,
  });
  steps.push("0. trace.start");

  const classifyPrompt = [
    "Classify this support ticket in one line (intent + risk):",
    `Customer: ${SAMPLE_TICKET.customer_email}`,
    `Order: ${SAMPLE_TICKET.order_id}`,
    `Message: ${SAMPLE_TICKET.message}`,
  ].join("\n");
  const classified = await runGemini(
    config,
    "You are a support triage model.",
    classifyPrompt,
  );
  const classifyEventId = await recordLlmInvocation(gov, {
    toolName: "google.generativeai.classifyIntent",
    purpose: "triage_support_ticket",
    prompt: classifyPrompt,
    response: classified.text,
    dataTouched: ["customer_email", "order_id", "ticket_message", "refund_amount_usd"],
    dataClassification: "pii_financial",
    businessContext: `Triage ticket ${SAMPLE_TICKET.ticket_id}: customer asks for ${SAMPLE_TICKET.refund_amount_usd} refund`,
  });
  await recordAgentDecision(gov, {
    decision: classified.text.slice(0, 200),
    rationale: "Proceed toward refund workflow",
    parentEventId: classifyEventId,
  });
  steps.push("1. classify + decision");

  const { server, url } = await startMockPaymentApi();
  try {
    const payment = await attemptPaymentTool(gov, {
      amountUsd: SAMPLE_TICKET.refund_amount_usd,
      customerEmail: SAMPLE_TICKET.customer_email,
      orderId: SAMPLE_TICKET.order_id,
      upstreamUrl: url,
      triggerSource: "llm_refund_workflow",
      triggerReason: `Ticket ${SAMPLE_TICKET.ticket_id} classified as refund`,
    });

    if (payment.outcome !== "approval_required") {
      server.close();
      throw new Error(
        `Expected approval_required but got ${payment.outcome}. Run: pnpm pilot:ensure-approval-policy`,
      );
    }

    steps.push("2. stripe.paymentIntents.create → WAITING for human (Approvals)");
    console.log(`  ${steps.at(-1)}`);
    console.log(`\n  Approval ID: ${payment.approvalId}`);
    console.log("  Open Console → Approvals → Approve or Reject");
    console.log(`  http://localhost:3000/aegis/approvals`);
    console.log(`\n  After approve: pnpm pilot:agent:resume ${payment.approvalId}\n`);

    return {
      mode: "approval_pending",
      trace_id: traceId,
      approval_id: payment.approvalId,
      ticket_id: SAMPLE_TICKET.ticket_id,
      console_trace_url: `http://localhost:3000/aegis/traces/${encodeURIComponent(traceId)}`,
      console_approvals_url: "http://localhost:3000/aegis/approvals",
      steps,
    };
  } finally {
    server.close();
  }
}

export async function resumeSupportRefundAfterApproval(
  config: PilotConfig,
  approvalId: string,
): Promise<ApprovalResumeResult> {
  const { getApprovalStatusViaApi } = await import("@salanor/aegis");
  const status = await getApprovalStatusViaApi(
    config.apiBaseUrl,
    config.ingestApiKey,
    approvalId,
  );
  if (status.status !== "approved") {
    throw new Error(
      `Approval ${approvalId} is "${status.status}" — approve it in Console → Approvals first`,
    );
  }
  const traceId = status.trace_id;

  const gov = createGovernance(config, traceId);
  const steps: string[] = [`resume approval ${approvalId}`];

  const { server, url } = await startMockPaymentApi();
  try {
    await resumePaymentAfterApproval(gov, {
      approvalId,
      upstreamUrl: url,
      amountUsd: SAMPLE_TICKET.refund_amount_usd,
      customerEmail: SAMPLE_TICKET.customer_email,
      orderId: SAMPLE_TICKET.order_id,
    });
    steps.push("payment executed after human approve (mock API)");
  } finally {
    server.close();
  }

  await finishTraceSession(gov, {
    summary: `Refund workflow completed after approval for ${SAMPLE_TICKET.ticket_id}`,
    outcome: "ok",
  });
  steps.push("trace.complete");

  const consoleUrl = `http://localhost:3000/aegis/traces/${encodeURIComponent(traceId)}`;
  console.log("\n=== Approval resume done ===");
  console.log(`Trace: ${consoleUrl}\n`);

  return {
    mode: "approval_resumed",
    trace_id: traceId,
    approval_id: approvalId,
    console_url: consoleUrl,
    steps,
  };
}
