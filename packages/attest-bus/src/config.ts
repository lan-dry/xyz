/** NATS JetStream defaults — override via env in deploy. */
export const DEFAULT_NATS_URL = "nats://127.0.0.1:4222";
export const DEFAULT_STREAM_NAME = "ATTEST_EVENTS";
export const DEFAULT_SUBJECT_PREFIX = "attest.events";
export const DEFAULT_INGEST_SUBJECT = "attest.events.ingest";
export const DEFAULT_CONSUMER_NAME = "attest-ledger-writer";

export interface AttestBusConfig {
  natsUrl: string;
  streamName: string;
  subjectPrefix: string;
  ingestSubject: string;
  consumerName: string;
}

export function loadBusConfig(env: NodeJS.ProcessEnv = process.env): AttestBusConfig {
  return {
    natsUrl: env.NATS_URL?.trim() || DEFAULT_NATS_URL,
    streamName: env.ATTEST_NATS_STREAM?.trim() || DEFAULT_STREAM_NAME,
    subjectPrefix: env.ATTEST_NATS_SUBJECT_PREFIX?.trim() || DEFAULT_SUBJECT_PREFIX,
    ingestSubject: env.ATTEST_NATS_INGEST_SUBJECT?.trim() || DEFAULT_INGEST_SUBJECT,
    consumerName: env.ATTEST_NATS_CONSUMER?.trim() || DEFAULT_CONSUMER_NAME,
  };
}

export function streamSubjects(prefix: string): string[] {
  return [`${prefix}.>`];
}
