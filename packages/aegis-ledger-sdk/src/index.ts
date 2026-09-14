import { record } from "./record.js";
import { remoteRecord } from "./remote.js";
import { replay } from "./replay.js";
import { verify } from "./verify.js";

export { record, type RecordResult } from "./record.js";
export { remoteRecord, AegisRemoteError, type RemoteRecordOptions, type RemoteRecordResult } from "./remote.js";
export { replay } from "./replay.js";
export {
  replayEvents,
  buildEvidenceExportPack,
  buildExportPackWitness,
  serializeExportPack,
  writeExportPack,
  type EvidenceExportPack,
  type ExportPackWitness,
} from "./replay-events.js";
export { computeMerkleRoot } from "./merkle.js";
export {
  verifyExportPack,
  parseExportPackJson,
  type VerifyExportPackResult,
} from "./verify-export-pack.js";
export { verify } from "./verify.js";
export { canonicalize, eventHashFromBody, sha256Hex } from "./canonical.js";
export { validateEvent, ApsValidationError } from "./schema.js";
export { readEvents, writeEvents } from "./store.js";
export type {
  ApsEvent,
  RecordInput,
  RecordOptions,
  ReplayResult,
  ReplayStep,
  VerifyResult,
} from "./types.js";

/** Namespace matching FR-APS-SDK-TS (`aegis.record`, `aegis.recordCloud`). */
export const aegis = { record, recordCloud: remoteRecord, replay, verify };
