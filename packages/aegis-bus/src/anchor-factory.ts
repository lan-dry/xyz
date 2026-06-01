import type { BlobStore } from "@salanor/aegis-storage";

import { StubAnchorProvider, type AnchorProvider } from "./anchor";
import { OpenTimestampsAnchorProvider } from "./ots-anchor";

export type AnchorMode = "stub" | "ots";

export function loadAnchorMode(): AnchorMode {
  const mode = (process.env.AEGIS_ANCHOR_MODE?.trim() || "stub") as AnchorMode;
  if (mode === "stub" || mode === "ots") {
    return mode;
  }
  throw new Error(`unsupported AEGIS_ANCHOR_MODE: ${mode}`);
}

/** Select anchor provider from env (stub default; OTS with calendar + blob store). */
export function createAnchorProvider(blobStore: BlobStore | null = null): AnchorProvider {
  const mode = loadAnchorMode();
  if (mode === "ots") {
    return new OpenTimestampsAnchorProvider(new StubAnchorProvider(), blobStore, {
      calendarUrl: process.env.AEGIS_OTS_CALENDAR_URL?.trim(),
      disabled: process.env.AEGIS_OTS_DISABLED === "1",
    });
  }
  return new StubAnchorProvider();
}
