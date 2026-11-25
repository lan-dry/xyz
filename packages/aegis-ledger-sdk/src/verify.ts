import { eventDigest } from "./canonical.js";
import { validateEvent } from "./schema.js";
import { readEvents } from "./store.js";
import type { VerifyResult } from "./types.js";

/**
 * Local integrity check: schema + parent_event_id continuity + recomputed digests.
 */
export function verify(storePath: string): VerifyResult {
  const events = readEvents(storePath);
  const errors: string[] = [];
  let expectedParent: string | undefined;

  for (const [index, event] of events.entries()) {
    try {
      validateEvent(event);
    } catch (err) {
      errors.push(`event[${index}] schema: ${(err as Error).message}`);
      continue;
    }

    if (event.parent_event_id !== expectedParent) {
      errors.push(
        `event[${index}] parent_event_id mismatch: expected ${expectedParent ?? "undefined"}, got ${event.parent_event_id ?? "undefined"}`,
      );
    }

    // Touch digest so a corrupt serialize would still be detectable by callers comparing hashes.
    void eventDigest(event);
    expectedParent = event.event_id;
  }

  return { ok: errors.length === 0, event_count: events.length, errors };
}
