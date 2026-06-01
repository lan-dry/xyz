import { connect, type NatsConnection } from "nats";

import { type AegisBusConfig, loadBusConfig } from "./config";
import { encodeIngestEnvelope, type IngestEnvelope } from "./envelope";
import { type BusLogger, consoleBusLogger } from "./logger";
import { ensureAegisStream } from "./stream";

export interface PublishIngestInput {
  traceId: string;
  organizationId?: string;
  event: IngestEnvelope["event"];
  idempotencyKey?: string;
}

export interface PublishIngestResult {
  subject: string;
  streamSeq: number;
}

let sharedNc: NatsConnection | null = null;

export async function connectAegisBus(
  config: AegisBusConfig = loadBusConfig(),
  log: BusLogger = consoleBusLogger,
): Promise<NatsConnection> {
  if (sharedNc && !sharedNc.isClosed()) {
    return sharedNc;
  }
  const nc = await connect({ servers: config.natsUrl });
  await ensureAegisStream(nc, config, log);
  sharedNc = nc;
  return nc;
}

export async function closeAegisBus(): Promise<void> {
  if (sharedNc && !sharedNc.isClosed()) {
    await sharedNc.drain();
    await sharedNc.close();
  }
  sharedNc = null;
}

export async function publishIngest(
  input: PublishIngestInput,
  options?: {
    config?: AegisBusConfig;
    nc?: NatsConnection;
    log?: BusLogger;
  },
): Promise<PublishIngestResult> {
  const config = options?.config ?? loadBusConfig();
  const log = options?.log ?? consoleBusLogger;
  const nc = options?.nc ?? (await connectAegisBus(config, log));
  const js = nc.jetstream();

  const envelope: IngestEnvelope = {
    schema_version: "1",
    trace_id: input.traceId,
    organization_id: input.organizationId,
    event: input.event,
    idempotency_key: input.idempotencyKey,
    published_at: new Date().toISOString(),
  };

  const ack = await js.publish(config.ingestSubject, encodeIngestEnvelope(envelope), {
    msgID: input.idempotencyKey,
  });

  log({
    level: "info",
    trace_id: input.traceId,
    event_id: input.event.event_id,
    msg: "bus_publish_ack",
    subject: config.ingestSubject,
    stream: config.streamName,
    detail: `seq=${ack.seq}`,
  });

  return { subject: config.ingestSubject, streamSeq: ack.seq };
}
