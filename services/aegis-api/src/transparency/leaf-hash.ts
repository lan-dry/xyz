import { createHash } from "node:crypto";

/** RFC 6962-style append-only log leaf (domain-separated). */
export function transparencyLeafHash(input: {
  organizationId: string;
  logIndex: number;
  eventId: string;
  eventHash: string;
  rootId: string;
}): string {
  const body = [
    "APS-TL1",
    input.organizationId,
    String(input.logIndex),
    input.eventId,
    input.eventHash,
    input.rootId,
  ].join("\n");
  return createHash("sha256").update(body, "utf8").digest("hex");
}
