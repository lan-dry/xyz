import { createHash } from "node:crypto";

/** SHA-256 anchor for a trace session (trace id + agent + start time). */
export function computeChainRootHash(input: {
  traceId: string;
  agentId: string;
  startedAt: string;
}): string {
  const material = `${input.traceId}\n${input.agentId}\n${input.startedAt}`;
  return createHash("sha256").update(material, "utf8").digest("hex");
}
