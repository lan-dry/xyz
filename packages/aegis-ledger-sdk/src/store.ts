import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { eventDigest } from "./canonical.js";
import type { ApsEvent } from "./types.js";

export function readEvents(path: string): ApsEvent[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  if (!raw.trim()) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ApsEvent);
}

export function writeEvents(path: string, events: ApsEvent[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  writeFileSync(path, body, "utf8");
}

export function appendEvent(path: string, event: ApsEvent): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
}

export function lastEventId(events: ApsEvent[]): string | null {
  if (events.length === 0) {
    return null;
  }
  return events[events.length - 1]!.event_id;
}

/** @deprecated Prefer lastEventId; digest is recomputed from the event body. */
export function lastEventHash(events: ApsEvent[]): string | null {
  if (events.length === 0) {
    return null;
  }
  return eventDigest(events[events.length - 1]!);
}
