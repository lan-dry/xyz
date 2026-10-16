import { redactForUpstream } from "../dlp/detector.js";
import type { DlpProfile } from "../dlp/patterns.js";
import {
  clamAvConfigured,
  clamAvRequired,
  scanBufferWithClamAv,
} from "./clamav.js";
import { detectMime, mimeAllowed } from "./mime.js";

export type ScanInput = {
  buffer: Buffer;
  declaredMime: string;
  originalName: string;
  allowList: string[];
  dlpProfile: DlpProfile;
  maxBytes: number;
};

export type ScanResult =
  | {
      status: "clean";
      mimeType: string;
      textExtract: string | null;
      detail: string;
    }
  | { status: "blocked"; detail: string };

const BLOCKED_NAME = /\.(exe|bat|cmd|ps1|sh|dll|msi|scr|js|vbs)$/i;

export async function scanAttachment(input: ScanInput): Promise<ScanResult> {
  if (input.buffer.length > input.maxBytes) {
    return {
      status: "blocked",
      detail: `Files must be ${Math.round(input.maxBytes / (1024 * 1024))} MB or smaller.`,
    };
  }
  if (BLOCKED_NAME.test(input.originalName)) {
    return { status: "blocked", detail: "This file type isn't allowed." };
  }

  const detected = detectMime(input.buffer);
  if (!mimeAllowed(detected ?? "", input.declaredMime, input.allowList)) {
    return {
      status: "blocked",
      detail: "This file type isn't allowed.",
    };
  }
  const mimeType = detected ?? input.declaredMime;

  if (input.buffer.includes(0)) {
    const sample = input.buffer.subarray(0, 4096);
    if (sample.includes(Buffer.from("MZ"))) {
      return { status: "blocked", detail: "This file isn't allowed." };
    }
  }

  if (clamAvConfigured() || clamAvRequired()) {
    try {
      const av = await scanBufferWithClamAv(input.buffer);
      if (!av.clean) {
        return {
          status: "blocked",
          detail: "This file was blocked by the virus check.",
        };
      }
    } catch (error) {
      console.error("[stoa] attachment virus scan", error);
      if (clamAvRequired()) {
        return {
          status: "blocked",
          detail: "File check unavailable. Try again later.",
        };
      }
    }
  }

  let textExtract: string | null = null;
  if (mimeType.startsWith("text/") || mimeType === "application/csv") {
    const raw = input.buffer.toString("utf8").slice(0, 200_000);
    const redacted = await redactForUpstream(
      raw,
      { profile: input.dlpProfile },
      { timeoutMs: 60_000 },
    );
    textExtract = redacted.text.replace(
      /\[([A-Z][A-Z0-9_]*?)_\d+\]/g,
      "[$1_WITHHELD]",
    );
  }

  const avNote = clamAvConfigured() ? " ClamAV: clean." : "";
  return {
    status: "clean",
    mimeType,
    textExtract,
    detail: `Passed type, size, and content heuristics.${avNote}`,
  };
}
