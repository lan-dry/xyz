import {
  buildEnvelope,
  keyPairFromSeed,
  sendEvent,
  signEnvelope,
  type BusinessEvent,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import type { CollectorConfig } from "./config.js";
import { ingestUrl } from "./config.js";
import { buildCollectorEvent } from "./event.js";
import { readPrivateKey } from "./keystore.js";
import { CollectorState } from "./state.js";
import type { CdcChange, LogicalChangeStream } from "./types.js";

export type CollectorDeps = {
  stream: LogicalChangeStream;
  fetch?: typeof fetch;
  now?: () => Date;
};

export type CollectorHandle = {
  readonly publicKeyB64: string;
  readonly sourceId: string;
  /** Process changes until the stream ends or stop() is called. */
  run(): Promise<{ delivered: number; errors: number }>;
  stop(): Promise<void>;
};

/**
 * Sign each CDC change with the collector's own key and POST to Aegis
 * `/v1/aegis/collector-events`. Separate process and credential from the app.
 */
export async function createCollector(
  config: CollectorConfig,
  deps: CollectorDeps,
): Promise<CollectorHandle> {
  const seed = await readPrivateKey(
    config.private_key_path,
    config.private_key_passphrase,
  );
  const pair = await keyPairFromSeed(seed);
  const state = await CollectorState.open(config.state_dir, config.source_id);
  const url = ingestUrl(config);
  const doFetch = deps.fetch ?? fetch;
  let stopping = false;

  async function deliver(change: CdcChange): Promise<boolean> {
    const event = buildCollectorEvent(change, config.case_id_mappings);
    const seq = state.nextSeq();
    const unsigned = buildEnvelope({
      source_id: config.source_id,
      key_id: config.key_id,
      seq,
      event: event as unknown as BusinessEvent,
      ts: deps.now?.() ?? new Date(change.captured_at),
      idempotency_key: event.idempotency_key,
    });
    const envelope: SignedEnvelope = await signEnvelope(
      unsigned,
      pair.privateKey,
    );
    const result = await sendEvent({
      url,
      bearer: config.ingest_bearer,
      envelope,
      fetch: doFetch,
      timeoutMs: config.request_timeout_ms,
    });
    if (!result.ok) {
      // Roll back local seq so a retry reuses the same sequence intent after
      // restart from state — for a Partial collector we keep seq advanced and
      // surface the error; operator restarts after fixing ingest.
      throw new Error(
        `collector ingest failed status=${result.status}: ${JSON.stringify(result.body)}`,
      );
    }
    await state.recordLsn(change.lsn);
    return true;
  }

  return {
    publicKeyB64: pair.publicKeyB64,
    sourceId: config.source_id,
    async run() {
      let delivered = 0;
      let errors = 0;
      for await (const change of deps.stream.changes()) {
        if (stopping) break;
        try {
          await deliver(change);
          delivered++;
        } catch (err) {
          errors++;
          console.error(
            JSON.stringify({
              msg: "aegis-collector-pg deliver error",
              error: err instanceof Error ? err.message : String(err),
              lsn: change.lsn,
              table: `${change.schema}.${change.table}`,
            }),
          );
          // Stop on first hard failure so seq ordering stays honest.
          throw err;
        }
      }
      return { delivered, errors };
    },
    async stop() {
      stopping = true;
      await deps.stream.stop();
    },
  };
}
