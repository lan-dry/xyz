export {
  digestHex,
  signEvent,
  signingDigest,
  stripSignatureFields,
  verifyEventSignature,
} from "./canonical.js";
export { signAndIngest, type IngestResult } from "./ingest.js";
export { enrichProvenancePayload } from "./enrich-payload.js";
export {
  endSpan,
  newTraceId,
  recordDataAccess,
  recordDecision,
  recordLlmInvocation,
  recordProvenanceClaim,
  recordTraceStart,
  startSpan,
  type RecordContext,
  type RecordOptions,
} from "./record.js";
export { mergeSpanPayload, newSpanId, spanPayload } from "./span.js";
export {
  DENIED_TOOL_NAMES,
  ApprovalRequiredError,
  PolicyDeniedError,
  evaluatePolicyViaApi,
  evaluateToolPolicyLocal,
  wrapFetch,
  wrapFetchResume,
  type WrapFetchConfig,
  type WrapFetchContext,
} from "./proxy/index.js";
export type {
  ActionKind,
  ActorType,
  ApsEvent,
  PolicyDecision,
  SignAndIngestOptions,
  SignOptions,
} from "./types.js";
export {
  buildGovernanceInsights,
  type GovernanceEventInput,
  type GovernanceInsight,
  type GovernanceInsightsResult,
  type InsightSeverity,
} from "./governance-insights.js";

export const PACKAGE_NAME = "@salanor/aegis" as const;

export function version(): string {
  return "0.1.0";
}
