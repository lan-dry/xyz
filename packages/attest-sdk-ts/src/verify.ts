import { eventHashFromBody } from "./canonical.js";
import { validateEvent } from "./schema.js";
import { readEvents } from "./store.js";
import type { ApsEvent, VerifyResult } from "./types.js";

function bodyWithoutEventHash(event: ApsEvent): Record<string, unknown> {
  const { chain, ...rest } = event;
  return {
    ...rest,
    chain: { prev_event_hash: chain.prev_event_hash },
  };
}

/**
 * Local integrity check: schema + hash chain continuity.
 */
export function verify(storePath: string): VerifyResult {
  const events = readEvents(storePath);
  const errors: string[] = [];
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

  return { ok: errors.length === 0, event_count: events.length, errors };
}
