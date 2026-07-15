import { canonicalize, sha256Hex } from "./canonical.js";
import type { ApsEvent, ReplayResult } from "./types.js";
import { replay } from "./replay.js";
import { writeEvents } from "./store.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tier-A replay from in-memory / DB-loaded events (P3 ledger path).
 */
export function replayEvents(events: ApsEvent[], traceId = "ledger"): ReplayResult {
  const dir = mkdtempSync(join(tmpdir(), "aegis-replay-"));
  const storePath = join(dir, "ledger.ndjson");
  try {
    writeEvents(storePath, events);
    return replay(storePath, traceId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** FR-AEG-REPLAY-TIER-C — read-only verification for external verifiers (no decision re-execution). */
export interface ExportPackWitness {
  merkle_root: string;
  anchor_status: string;
  anchor_ref: string | null;
  event_count: number;
  generated_at: string;
}

export interface EvidenceExportPack {
  schema_version: "1";
  exported_at: string;
  trace_id: string;
  events: ApsEvent[];
  replay: ReplayResult;
  anchor?: {
    batch_id: string;
    merkle_root: string;
    anchor_status: string;
    anchor_ref: string | null;
    local_chain_root: string | null;
  };
  witness?: ExportPackWitness;
}

export function buildExportPackWitness(input: {
  merkleRoot: string;
  anchorStatus: string;
  anchorRef: string | null;
  eventCount: number;
  generatedAt?: string;
}): ExportPackWitness {
  return {
    merkle_root: input.merkleRoot,
    anchor_status: input.anchorStatus,
    anchor_ref: input.anchorRef,
    event_count: input.eventCount,
    generated_at: input.generatedAt ?? new Date().toISOString(),
  };
}

export function buildEvidenceExportPack(input: {
  traceId: string;
  events: ApsEvent[];
  anchor?: EvidenceExportPack["anchor"];
  witness?: ExportPackWitness;
}): EvidenceExportPack {
  const replay = replayEvents(input.events, input.traceId);
  const witness =
    input.witness ??
    (input.anchor
      ? buildExportPackWitness({
          merkleRoot: input.anchor.merkle_root,
          anchorStatus: input.anchor.anchor_status,
          anchorRef: input.anchor.anchor_ref,
          eventCount: input.events.length,
          generatedAt: new Date().toISOString(),
        })
      : undefined);

  return {
    schema_version: "1",
    exported_at: new Date().toISOString(),
    trace_id: input.traceId,
    events: input.events,
    replay,
    anchor: input.anchor,
    witness,
  };
}

export function serializeExportPack(pack: EvidenceExportPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export function writeExportPack(path: string, pack: EvidenceExportPack): void {
  writeFileSync(path, serializeExportPack(pack), "utf8");
}
