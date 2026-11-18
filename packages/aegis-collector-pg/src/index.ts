export {
  COLLECTOR_EVENT_TYPE,
  DEFAULT_COLLECTOR_SOURCE_ID,
  LogicalDecodingUnavailableError,
} from "./types.js";
export type {
  CdcChange,
  CdcOperation,
  CollectorCdcEvent,
  LogicalChangeStream,
} from "./types.js";

export { hashNewValues, changeFingerprint } from "./hash.js";
export {
  buildCollectorEvent,
  resolveCaseId,
  newIdempotencyKey,
} from "./event.js";
export type { CaseIdMapping } from "./event.js";

export {
  parseConfig,
  loadConfigFile,
  ingestUrl,
  DEFAULT_COLLECTOR_INGEST_PATH,
} from "./config.js";
export type {
  CollectorConfig,
  CollectorTableConfig,
} from "./config.js";

export { createCollector } from "./collector.js";
export type { CollectorDeps, CollectorHandle } from "./collector.js";

export { SimulatedChangeStream } from "./simulated.js";
export {
  PgoutputLogicalStream,
  checkLogicalDecoding,
  ensurePublicationAndSlot,
  cdcChangeFromRow,
} from "./pgoutput.js";
export type { LogicalDecodingStatus } from "./pgoutput.js";

export { readPrivateKey, writePrivateKey } from "./keystore.js";
export { CollectorState } from "./state.js";
