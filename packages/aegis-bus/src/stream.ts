import {
  AckPolicy,
  DeliverPolicy,
  RetentionPolicy,
  StorageType,
  type JetStreamManager,
  type NatsConnection,
} from "nats";

import { type AegisBusConfig, streamSubjects } from "./config";
import { type BusLogger, consoleBusLogger } from "./logger";

export async function ensureAegisStream(
  nc: NatsConnection,
  config: AegisBusConfig,
  log: BusLogger = consoleBusLogger,
): Promise<JetStreamManager> {
  const jsm = await nc.jetstreamManager();
  const subjects = streamSubjects(config.subjectPrefix);

  try {
    await jsm.streams.info(config.streamName);
    log({
      level: "info",
      trace_id: "system",
      msg: "jetstream_stream_exists",
      stream: config.streamName,
    });
    return jsm;
  } catch {
    // stream missing — create below
  }

  await jsm.streams.add({
    name: config.streamName,
    subjects,
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
    duplicate_window: 120 * 1_000_000_000,
  });

  log({
    level: "info",
    trace_id: "system",
    msg: "jetstream_stream_created",
    stream: config.streamName,
    subject: subjects.join(","),
  });

  return jsm;
}

export async function ensureLedgerConsumer(
  nc: NatsConnection,
  config: AegisBusConfig,
  log: BusLogger = consoleBusLogger,
): Promise<void> {
  const jsm = await nc.jetstreamManager();
  const filterSubject = `${config.subjectPrefix}.>`;

  try {
    await jsm.consumers.info(config.streamName, config.consumerName);
    log({
      level: "info",
      trace_id: "system",
      msg: "jetstream_consumer_exists",
      stream: config.streamName,
      consumer: config.consumerName,
    });
    return;
  } catch {
    // create
  }

  await jsm.consumers.add(config.streamName, {
    durable_name: config.consumerName,
    filter_subject: filterSubject,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_deliver: 5,
  });

  log({
    level: "info",
    trace_id: "system",
    msg: "jetstream_consumer_created",
    stream: config.streamName,
    consumer: config.consumerName,
  });
}
