export {
  DEFAULT_CONSUMER_NAME,
  DEFAULT_INGEST_SUBJECT,
  DEFAULT_NATS_URL,
  DEFAULT_STREAM_NAME,
  DEFAULT_SUBJECT_PREFIX,
  loadBusConfig,
  streamSubjects,
  type AegisBusConfig,
} from "./config";
export {
  encodeIngestEnvelope,
  parseIngestEnvelope,
  type IngestEnvelope,
} from "./envelope";
export { type BusLogEntry, type BusLogger, consoleBusLogger } from "./logger";
export {
  closeAegisBus,
  connectAegisBus,
  publishIngest,
  type PublishIngestInput,
  type PublishIngestResult,
} from "./publish";
export { ensureAegisStream, ensureLedgerConsumer } from "./stream";
export {
  connectForWorker,
  runIngestConsumer,
  type IngestMessageHandler,
} from "./consumer";
export {
  StubAnchorProvider,
  computeMerkleRoot,
  resetStubChainForTests,
  type AnchorProvider,
  type AnchorBatchInput,
  type AnchorBatchResult,
  type AnchorStatus,
} from "./anchor";
export { createAnchorProvider, loadAnchorMode, type AnchorMode } from "./anchor-factory";
export {
  OpenTimestampsAnchorProvider,
  type OpenTimestampsAnchorOptions,
} from "./ots-anchor";
export {
  verifyOtsProof,
  upgradeOtsFromCalendar,
  hasBitcoinBlockConfirmation,
  isOpenTimestampsProof,
  OTS_BITCOIN_BLOCK_MAGIC,
  type OtsProofStatus,
  type OtsProofVerifyResult,
} from "./ots-verify";
