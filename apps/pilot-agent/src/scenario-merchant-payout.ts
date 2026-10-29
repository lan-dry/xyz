import { createServer } from "node:http";
import type { Server } from "node:http";
import type { PilotConfig } from "./config.js";
import {
  attemptPayoutTool,
  createGovernance,
  finishTraceSession,
  newTraceId,
  recordAgentDecision,
  resumePaymentAfterApproval,
  startTraceSession,
} from "./governance.js";

export const SAMPLE_PAYOUT = {
  payout_id: "PO-2500-4417",
  merchant_id: "merchant-4417",
  merchant_age_days: 12,
  amount_usd: 2500,
};

export type PayoutPendingResult = {
  mode: "approval_pending";
  trace_id: string;
  approval_id: string;
  payout_id: string;
  console_trace_url: string;
  console_approvals_url: string;
  steps: string[];
};

export type PayoutResumeResult = {
  mode: "approval_resumed";
  trace_id: string;
  approval_id: string;
  console_url: string;
  steps: string[];
};

function startMockPayoutApi(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "payout_created_mock" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("mock payout server failed"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/payout` });
    });
  });
}

/** Hero path: USD 2,500 payout to a merchant younger than 30 days → human approval. */
export async function runMerchantPayoutScenario(
  config: PilotConfig,
  options?: { riskScore?: number },
): Promise<PayoutPendingResult> {
  const traceId = newTraceId();
  const gov = createGovernance(config, traceId);
  const steps: string[] = [];
  const riskScore = options?.riskScore;

  console.log(
    riskScore != null
      ? `\n=== Pilot agent: merchant payout (risk score ${riskScore}) ===`
      : "\n=== Pilot agent: merchant payout (human approval) ===",
  );
  console.log(`Trace ID: ${traceId}\n`);

  await startTraceSession(gov, {
    ticketId: SAMPLE_PAYOUT.payout_id,
    summary:
      riskScore != null
        ? `Payout $${SAMPLE_PAYOUT.amount_usd} with fraud score ${riskScore}`
        : `Payout $${SAMPLE_PAYOUT.amount_usd} to ${SAMPLE_PAYOUT.merchant_id}`,
  });
  steps.push("0. trace.start");

  await recordAgentDecision(gov, {
    decision: `Propose payout of $${SAMPLE_PAYOUT.amount_usd} to ${SAMPLE_PAYOUT.merchant_id}`,
    rationale:
      riskScore != null
        ? `Customer fraud model scored ${riskScore}; Aegis score bands should Ask a person`
        : `Merchant age ${SAMPLE_PAYOUT.merchant_age_days} days; amount exceeds new-merchant threshold`,
  });
  steps.push("1. decision");

  const { server, url } = await startMockPayoutApi();
  try {
    const payout = await attemptPayoutTool(gov, {
      amountUsd: SAMPLE_PAYOUT.amount_usd,
      merchantId: SAMPLE_PAYOUT.merchant_id,
      merchantAgeDays: SAMPLE_PAYOUT.merchant_age_days,
      upstreamUrl: url,
      riskScore,
      riskModelName: riskScore != null ? "northwind-fraud" : undefined,
      riskModelVersion: riskScore != null ? "2026.10" : undefined,
    });

    if (payout.outcome !== "approval_required") {
      await finishTraceSession(gov, {
        summary: `Unexpected payout outcome: ${payout.outcome}`,
        outcome: "error",
      });
      throw new Error(
        `Expected approval_required for $${SAMPLE_PAYOUT.amount_usd} payout to a ${SAMPLE_PAYOUT.merchant_age_days}-day merchant; got ${payout.outcome}. Re-run pnpm db:local:pilot-fixture.`,
      );
    }

    steps.push("2. payments.payout.create → WAITING for human (Approvals)");
    console.log("  2. payments.payout.create → WAITING for human (Approvals)\n");
    console.log(`  Approval ID: ${payout.approvalId}`);
    console.log("  Open Console → Approvals → Approve or Reject");
    console.log("  http://localhost:3000/aegis/approvals\n");
    console.log(`  After approve: pnpm pilot:agent:resume:payout ${payout.approvalId}\n`);

    return {
      mode: "approval_pending",
      trace_id: traceId,
      approval_id: payout.approvalId,
      payout_id: SAMPLE_PAYOUT.payout_id,
      console_trace_url: `http://localhost:3000/aegis/traces/${traceId}`,
      console_approvals_url: "http://localhost:3000/aegis/approvals",
      steps,
    };
  } finally {
    server.close();
  }
}

export async function resumeMerchantPayoutAfterApproval(
  config: PilotConfig,
  approvalId: string,
): Promise<PayoutResumeResult> {
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

  console.log("\n=== Pilot agent: resume merchant payout after approval ===");
  console.log(`Approval ID: ${approvalId}`);
  console.log(`Trace ID: ${traceId}\n`);

  const { server, url } = await startMockPayoutApi();
  try {
    await resumePaymentAfterApproval(gov, {
      approvalId,
      upstreamUrl: url,
      amountUsd: SAMPLE_PAYOUT.amount_usd,
      customerEmail: SAMPLE_PAYOUT.merchant_id,
      orderId: SAMPLE_PAYOUT.payout_id,
      toolName: "payments.payout.create",
      merchantId: SAMPLE_PAYOUT.merchant_id,
      merchantAgeDays: SAMPLE_PAYOUT.merchant_age_days,
      beneficiary: SAMPLE_PAYOUT.merchant_id,
    });
    steps.push("1. payments.payout.create → executed after approval");
    console.log("  1. payments.payout.create → executed after approval");

    await finishTraceSession(gov, {
      summary: `Payout $${SAMPLE_PAYOUT.amount_usd} completed after human approval`,
      outcome: "ok",
    });
    steps.push("2. trace.complete");

    return {
      mode: "approval_resumed",
      trace_id: traceId,
      approval_id: approvalId,
      console_url: `http://localhost:3000/aegis/traces/${traceId}`,
      steps,
    };
  } finally {
    server.close();
  }
}
