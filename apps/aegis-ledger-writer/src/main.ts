import { prisma, type Prisma } from "@salanor/db";
import {
  computeMerkleRoot,
  consoleBusLogger,
  createAnchorProvider,
  loadBusConfig,
  runIngestConsumer,
  type IngestEnvelope,
} from "@salanor/aegis-bus";
import { canonicalize, validateEvent } from "@salanor/aegis-ledger-sdk";
import { createBlobStore, putContentAddressed } from "@salanor/aegis-storage";
import type { JsMsg } from "nats";

const DEV_ORG_ID =
  process.env.AEGIS_DEV_ORGANIZATION_ID?.trim() ?? "00000000-0000-4000-8000-000000000010";

const blobStore = createBlobStore();
const anchor = createAnchorProvider(blobStore);
const log = consoleBusLogger;
const BATCH_SIZE = Number(process.env.AEGIS_LEDGER_BATCH_SIZE ?? "1");

let pendingHashes: string[] = [];
let pendingEventIds: string[] = [];

async function flushBatch(): Promise<void> {
  if (pendingHashes.length === 0) {
    return;
  }
  const merkleRoot = computeMerkleRoot(pendingHashes);
  const anchored = await anchor.anchorBatch({
    merkleRoot,
    eventCount: pendingHashes.length,
  });

  const batch = await prisma.aegisLedgerBatch.create({
    data: {
      merkleRoot,
      eventCount: pendingHashes.length,
      anchorStatus: anchored.anchorStatus,
      anchorRef: anchored.anchorRef,
      localChainRoot: anchored.localChainRoot,
      otsBlobKey: anchored.otsBlobKey ?? null,
    },
  });

  await prisma.aegisIngestEvent.updateMany({
    where: { id: { in: pendingEventIds } },
    data: { batchId: batch.id },
  });

  log({
    level: "info",
    trace_id: "system",
    msg: "ledger_batch_flushed",
    detail: `batch=${batch.id} events=${pendingHashes.length} root=${merkleRoot.slice(0, 12)} anchor=${anchored.anchorStatus}`,
  });

  pendingHashes = [];
  pendingEventIds = [];
}

async function persistEnvelope(envelope: IngestEnvelope): Promise<string> {
  const event = validateEvent(envelope.event);

  if (envelope.idempotency_key) {
    const existing = await prisma.aegisIngestEvent.findUnique({
      where: { idempotencyKey: envelope.idempotency_key },
    });
    if (existing) {
      return existing.id;
    }
  }

  let payloadBlobKey: string | null = null;
  if (blobStore) {
    const stored = await putContentAddressed(blobStore, Buffer.from(canonicalize(event), "utf8"));
    payloadBlobKey = stored.key;
  }

  const row = await prisma.aegisIngestEvent.create({
    data: {
      organizationId: envelope.organization_id ?? DEV_ORG_ID,
      traceId: envelope.trace_id,
      payload: event as unknown as Prisma.InputJsonValue,
      payloadBlobKey,
      idempotencyKey: envelope.idempotency_key ?? null,
    },
  });

  pendingHashes.push(event.chain.event_hash);
  pendingEventIds.push(row.id);

  if (pendingHashes.length >= BATCH_SIZE) {
    await flushBatch();
  }

  return row.id;
}

async function main(): Promise<void> {
  const config = loadBusConfig();
  log({
    level: "info",
    trace_id: "system",
    msg: "aegis_ledger_writer_start",
    stream: config.streamName,
    consumer: config.consumerName,
    detail: `blob=${blobStore ? "on" : "off"} anchor=${process.env.AEGIS_ANCHOR_MODE ?? "stub"}`,
  });

  const shutdown = async () => {
    await flushBatch();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await runIngestConsumer({
    config,
    log,
    handler: async (envelope, msg: JsMsg) => {
      const rowId = await persistEnvelope(envelope);
      msg.ack();
      log({
        level: "info",
        trace_id: envelope.trace_id,
        event_id: envelope.event.event_id,
        msg: "ledger_event_persisted",
        detail: `row=${rowId}`,
      });
    },
  });
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", trace_id: "system", msg: "ledger_writer_fatal", detail: String(err) }));
  process.exit(1);
});
