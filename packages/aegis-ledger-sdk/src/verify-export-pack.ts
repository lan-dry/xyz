import { eventHashFromBody } from "./canonical.js";
import { computeMerkleRoot } from "./merkle.js";
import { replayEvents } from "./replay-events.js";
import type { EvidenceExportPack, ExportPackWitness } from "./replay-events.js";
import { validateEvent } from "./schema.js";
import type { ApsEvent } from "./types.js";

export interface VerifyExportPackResult {
  ok: boolean;
  errors: string[];
  event_count: number;
  merkle_root?: string;
  anchor_status?: string;
  witness_valid?: boolean;
}

function bodyWithoutEventHash(event: ApsEvent): Record<string, unknown> {
  const { chain, ...rest } = event;
  return {
    ...rest,
    chain: { prev_event_hash: chain.prev_event_hash },
  };
}

function verifyEventChain(events: ApsEvent[], errors: string[]): void {
  let expectedPrev: string | null = null;
  for (const [index, event] of events.entries()) {
    try {
      validateEvent(event);
    } catch (err) {
      errors.push(`event[${index}] schema: ${(err as Error).message}`);
      continue;
    }

    if (event.chain.prev_event_hash !== expectedPrev) {
      errors.push(
        `event[${index}] prev_event_hash mismatch: expected ${expectedPrev ?? "null"}, got ${event.chain.prev_event_hash}`,
      );
    }

    const computed = eventHashFromBody(bodyWithoutEventHash(event));
    if (computed !== event.chain.event_hash) {
      errors.push(`event[${index}] event_hash mismatch`);
    }

    expectedPrev = event.chain.event_hash;
  }
}

/**
 * FR-ATT-VERIFY-OSS — offline verification of JSON evidence export packs.
 */
export function verifyExportPack(pack: EvidenceExportPack): VerifyExportPackResult {
  const errors: string[] = [];

  if (pack.schema_version !== "1") {
    errors.push(`unsupported schema_version: ${String((pack as { schema_version?: unknown }).schema_version)}`);
  }

  if (!Array.isArray(pack.events) || pack.events.length === 0) {
    errors.push("events must be a non-empty array");
    return { ok: false, errors, event_count: 0 };
  }

  verifyEventChain(pack.events, errors);

  const replay = replayEvents(pack.events, pack.trace_id);
  if (replay.digest !== pack.replay.digest) {
    errors.push(`replay digest mismatch: expected ${pack.replay.digest}, got ${replay.digest}`);
  }

  const merkleRoot = computeMerkleRoot(pack.events.map((e) => e.chain.event_hash));

  if (pack.anchor) {
    if (pack.anchor.merkle_root !== merkleRoot) {
      errors.push(
        `anchor merkle_root mismatch: expected ${pack.anchor.merkle_root}, computed ${merkleRoot}`,
      );
    }
    const allowed = new Set(["stub", "pending", "anchored"]);
    if (!allowed.has(pack.anchor.anchor_status)) {
      errors.push(`unknown anchor_status: ${pack.anchor.anchor_status}`);
    }
  }

  let witnessValid: boolean | undefined;
  if (pack.witness) {
    witnessValid = verifyWitnessBlock(pack.witness, {
      merkleRoot,
      eventCount: pack.events.length,
      anchorStatus: pack.anchor?.anchor_status,
      anchorRef: pack.anchor?.anchor_ref ?? null,
    });
    if (!witnessValid) {
      errors.push("witness block does not match pack anchor/replay state");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    event_count: pack.events.length,
    merkle_root: merkleRoot,
    anchor_status: pack.anchor?.anchor_status ?? pack.witness?.anchor_status,
    witness_valid: witnessValid,
  };
}

function verifyWitnessBlock(
  witness: ExportPackWitness,
  expected: {
    merkleRoot: string;
    eventCount: number;
    anchorStatus?: string;
    anchorRef: string | null;
  },
): boolean {
  if (witness.merkle_root !== expected.merkleRoot) {
    return false;
  }
  if (witness.event_count !== expected.eventCount) {
    return false;
  }
  const allowed = new Set(["stub", "pending", "anchored"]);
  if (!allowed.has(witness.anchor_status)) {
    return false;
  }
  if (expected.anchorStatus !== undefined && witness.anchor_status !== expected.anchorStatus) {
    return false;
  }
  if (witness.anchor_ref !== expected.anchorRef) {
    return false;
  }
  if (!witness.generated_at || Number.isNaN(Date.parse(witness.generated_at))) {
    return false;
  }
  return true;
}

export function parseExportPackJson(raw: string): EvidenceExportPack {
  const parsed = JSON.parse(raw) as EvidenceExportPack;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("export pack must be a JSON object");
  }
  return parsed;
}
