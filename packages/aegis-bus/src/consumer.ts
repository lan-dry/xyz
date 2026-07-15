import { connect, type JsMsg, type NatsConnection } from "nats";

import { type AegisBusConfig, loadBusConfig } from "./config";
import { parseIngestEnvelope, type IngestEnvelope } from "./envelope";
import { type BusLogger, consoleBusLogger } from "./logger";
import { ensureAegisStream, ensureLedgerConsumer } from "./stream";

export type IngestMessageHandler = (envelope: IngestEnvelope, msg: JsMsg) => Promise<void>;

export async function runIngestConsumer(params: {
  handler: IngestMessageHandler;
  config?: AegisBusConfig;
  log?: BusLogger;
  signal?: AbortSignal;
}): Promise<void> {
  const config = params.config ?? loadBusConfig();
  const log = params.log ?? consoleBusLogger;
  const nc = await connect({ servers: config.natsUrl });
  await ensureAegisStream(nc, config, log);
  await ensureLedgerConsumer(nc, config, log);

  const js = nc.jetstream();
  const consumer = await js.consumers.get(config.streamName, config.consumerName);

  log({
    level: "info",
    trace_id: "system",
    msg: "ledger_consumer_started",
    stream: config.streamName,
    consumer: config.consumerName,
  });

  const messages = await consumer.consume();
  const abort = params.signal;

  for await (const msg of messages) {
    if (abort?.aborted) {
      break;
    }

    let envelope: IngestEnvelope;
    try {
      envelope = parseIngestEnvelope(msg.data);
    } catch (err) {
      log({
        level: "error",
        trace_id: "unknown",
        msg: "envelope_parse_failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      msg.term();
      continue;
    }

    try {
      await params.handler(envelope, msg);
    } catch (err) {
      log({
        level: "error",
        trace_id: envelope.trace_id,
        event_id: envelope.event.event_id,
        msg: "handler_failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      msg.nak();
    }
  }

  await nc.drain();
  await nc.close();
}

export async function connectForWorker(
  config: AegisBusConfig = loadBusConfig(),
  log: BusLogger = consoleBusLogger,
): Promise<NatsConnection> {
  const nc = await connect({ servers: config.natsUrl });
  await ensureAegisStream(nc, config, log);
  await ensureLedgerConsumer(nc, config, log);
  return nc;
}
