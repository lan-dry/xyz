import { createHash } from "node:crypto";
import type { RedactionManifestEntry } from "./manifest.js";
import { openVault } from "./vault-crypto.js";
import { mergeVaults, rehydrateText } from "./rehydrate.js";

export type MessageRow = {
  id: string;
  role: string;
  content: string;
  content_display: string | null;
  redaction_count: number;
  redaction_vault: string | null;
  redaction_manifest: RedactionManifestEntry[] | null;
  created_at: Date;
};

export type ClientMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  /** What the member reads and copies: originals restored. */
  content: string;
  /** Exactly what the model provider received or returned, when it differs. */
  contentUpstream?: string;
  redactionCount: number;
  redactionManifest?: RedactionManifestEntry[];
  /** Assistant only: placeholders restored to real values in this reply. */
  restoredCount?: number;
  createdAt: string;
};

export function collectThreadVault(
  rows: Pick<MessageRow, "redaction_vault">[],
): Record<string, string> {
  return mergeVaults(rows.map((r) => openVault(r.redaction_vault)));
}

export function upstreamFingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function countRestored(upstream: string, restored: string, vault: Record<string, string>): number {
  if (upstream === restored) {
    return 0;
  }
  let n = 0;
  for (const token of Object.keys(vault)) {
    const core = token.replace(/^\[|\]$/g, "");
    n += upstream.split(core).length - 1;
  }
  return n;
}

export function presentUserMessage(input: {
  id: string;
  upstream: string;
  display: string | null;
  redactionCount: number;
  manifest: RedactionManifestEntry[] | null;
  createdAt: Date;
  threadVault: Record<string, string>;
}): ClientMessage {
  const display = rehydrateText(input.display ?? input.upstream, input.threadVault);
  return {
    id: input.id,
    role: "user",
    content: display,
    contentUpstream:
      input.redactionCount > 0 && input.upstream !== display ? input.upstream : undefined,
    redactionCount: input.redactionCount,
    redactionManifest: input.manifest ?? undefined,
    createdAt: input.createdAt.toISOString(),
  };
}

export function presentAssistantMessage(input: {
  id: string;
  upstream: string;
  createdAt: Date;
  threadVault: Record<string, string>;
}): ClientMessage {
  const restored = rehydrateText(input.upstream, input.threadVault);
  const restoredCount = countRestored(input.upstream, restored, input.threadVault);
  return {
    id: input.id,
    role: "assistant",
    content: restored,
    contentUpstream: restored !== input.upstream ? input.upstream : undefined,
    redactionCount: 0,
    restoredCount: restoredCount > 0 ? restoredCount : undefined,
    createdAt: input.createdAt.toISOString(),
  };
}

export function toClientMessage(
  row: MessageRow,
  threadVault: Record<string, string>,
): ClientMessage {
  if (row.role === "user") {
    return presentUserMessage({
      id: row.id,
      upstream: row.content,
      display: row.content_display,
      redactionCount: row.redaction_count,
      manifest: row.redaction_manifest,
      createdAt: row.created_at,
      threadVault,
    });
  }
  if (row.role === "assistant") {
    return presentAssistantMessage({
      id: row.id,
      upstream: row.content,
      createdAt: row.created_at,
      threadVault,
    });
  }
  return {
    id: row.id,
    role: row.role as ClientMessage["role"],
    content: row.content,
    redactionCount: row.redaction_count,
    createdAt: row.created_at.toISOString(),
  };
}
