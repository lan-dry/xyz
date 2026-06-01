import "../aegis-demo/load-root-env.mts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@salanor/db";
import {
  aegis,
  AegisRemoteError,
  buildEvidenceExportPack,
  verifyExportPack,
  writeExportPack,
} from "@salanor/aegis-ledger-sdk";

const baseUrl = process.env.AEGIS_INGEST_BASE_URL?.trim() || "http://localhost:3000";
const apiKey = process.env.AEGIS_INGEST_DEV_KEY?.trim();
const pollMs = Number(process.env.AEGIS_P3_POLL_MS ?? "500");
const pollMax = Number(process.env.AEGIS_P3_POLL_MAX ?? "60");

if (!apiKey) {
  console.error("Set AEGIS_INGEST_DEV_KEY in .env before running P3 smoke.");
  process.exit(1);
}

const traceId = process.env.AEGIS_P3_TRACE_ID?.trim() || "88888888-8888-4888-8888-888888888801";
const eventId = process.env.AEGIS_P3_EVENT_ID?.trim() || "99999999-9999-4999-8999-999999999901";
const idempotencyKey = `p3-smoke-${eventId}`;

async function waitForLedger(): Promise<void> {
  for (let i = 0; i < pollMax; i++) {
    const row = await prisma.aegisIngestEvent.findFirst({
      where: { traceId },
      orderBy: { receivedAt: "desc" },
      include: { batch: true },
    });
    if (row) {
      console.log(`[ledger] event persisted row=${row.id} batch=${row.batchId ?? "pending"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for ledger row trace_id=${traceId}`);
}

async function main(): Promise<void> {
  console.log("Aegis P3 smoke — ingest → bus → ledger → replay → export\n");

  const ingest = await aegis.recordCloud(
    {
      tenant_id: "p3-smoke",
      actor: { id: "agent:p3-smoke", type: "software_agent" },
      action: "decision.record",
      subject: { type: "workflow_step", id: "p3-smoke-step" },
      context: {
        inputs: { amount_usd: 5000 },
        model: { id: "rules-v1", version: "1.0.0" },
        policy: { id: "demo-policy", version: "2026-05" },
        evidence: [],
        outcome: { decision: "approve", confidence: 0.88 },
      },
    },
    {
      baseUrl,
      apiKey,
      traceId,
      event_id: eventId,
      recorded_at: "2026-05-16T14:00:00.000Z",
      idempotencyKey,
    },
  );

  console.log(`[ingest] event_id=${ingest.event_id} trace_id=${ingest.trace_id}`);

  await waitForLedger();

  const rows = await prisma.aegisIngestEvent.findMany({
    where: { traceId },
    orderBy: { receivedAt: "asc" },
    include: { batch: true },
  });

  const events = rows.map((r) => r.payload as Parameters<typeof buildEvidenceExportPack>[0]["events"][0]);
  const batch = rows.find((r) => r.batch)?.batch;

  const pack = buildEvidenceExportPack({
    traceId,
    events,
    anchor: batch
      ? {
          batch_id: batch.id,
          merkle_root: batch.merkleRoot,
          anchor_status: batch.anchorStatus,
          anchor_ref: batch.anchorRef,
          local_chain_root: batch.localChainRoot,
        }
      : undefined,
  });

  const outDir = join(process.cwd(), "tmp", "aegis-p3-smoke");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `export-${traceId}.json`);
  writeExportPack(outPath, pack);

  const verified = verifyExportPack(pack);
  if (!verified.ok) {
    throw new Error(`export verify failed: ${verified.errors.join("; ")}`);
  }

  const anchorStatus = batch?.anchorStatus ?? "none";
  const allowedAnchor = new Set(["stub", "pending", "anchored"]);
  if (batch && !allowedAnchor.has(anchorStatus)) {
    throw new Error(`unexpected anchor_status: ${anchorStatus}`);
  }

  console.log(`[replay] digest=${pack.replay.digest}`);
  console.log(`[anchor] status=${anchorStatus}`);
  if (pack.witness) {
    console.log(
      `[witness] tier=C merkle=${pack.witness.merkle_root.slice(0, 12)}… events=${pack.witness.event_count}`,
    );
  }
  console.log(`[export] ${outPath}`);
  console.log(`[verify-pack] ok=true events=${verified.event_count} witness=${verified.witness_valid ?? "n/a"}`);
  if (anchorStatus === "pending") {
    console.log("[anchor] run `pnpm aegis:anchor-reconcile` after calendar confirms Bitcoin block");
  }
  console.log("\nP3 smoke complete.");
}

main()
  .catch((err) => {
    if (err instanceof AegisRemoteError) {
      console.error(`[smoke] ingest failed (${err.status}): ${err.message}`);
      if (err.body !== undefined) {
        console.error("[smoke] response body:", JSON.stringify(err.body, null, 2));
      }
    } else {
      console.error("[smoke] failed:", err instanceof Error ? err.message : err);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
