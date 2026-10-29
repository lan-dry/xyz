import { redactForUpstream } from "../dlp/detector.js";
import type { DlpProfile } from "../dlp/patterns.js";
import {
  clamAvConfigured,
  clamAvRequired,
  scanBufferWithClamAv,
} from "./clamav.js";
import {
  extractPlainText,
  mimeNeedsTextExtract,
} from "./extract-text.js";
import { detectMime, mimeAllowed } from "./mime.js";
import {
  isLikelyScannedPdf,
  redactScannedPdfForUpstream,
} from "./pdf-redact.js";
import { redactImageForUpstream } from "./pixel-redact.js";

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
      /** Cleaned PNG (OCR + black boxes). Model still gets textExtract only. */
      redactedImage: Buffer | null;
      detail: string;
    }
  | { status: "blocked"; detail: string };

const BLOCKED_NAME = /\.(exe|bat|cmd|ps1|sh|dll|msi|scr|js|vbs)$/i;

function toWithheldPlaceholders(text: string): string {
  return text.replace(/\[([A-Z][A-Z0-9_]*?)_\d+\]/g, "[$1_WITHHELD]");
}

function imageOcrEnabled(): boolean {
  // Default on. Set STOA_ATTACHMENT_OCR=0 to disable image uploads to AI.
  return process.env.STOA_ATTACHMENT_OCR !== "0";
}

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

  if (!mimeNeedsTextExtract(mimeType)) {
    return {
      status: "blocked",
      detail:
        "Only text, CSV, PDF, Word (.docx), or images can be sent to the model after privacy review.",
    };
  }

  const avNote = clamAvConfigured() ? " ClamAV: clean." : "";

  if (mimeType.startsWith("image/")) {
    if (!imageOcrEnabled()) {
      return {
        status: "blocked",
        detail:
          "Image AI processing is disabled (STOA_ATTACHMENT_OCR=0). Upload PDF, DOCX, or TXT.",
      };
    }
    const pixel = await redactImageForUpstream(input.buffer, input.dlpProfile);
    if ("error" in pixel) {
      return { status: "blocked", detail: pixel.error };
    }
    return {
      status: "clean",
      mimeType,
      textExtract: pixel.redactedText,
      redactedImage: pixel.redactedPng,
      detail: `OCR + pixel redaction (${pixel.boxesPainted} region(s) covered). Model receives redacted text only.${avNote}`,
    };
  }

  if (mimeType === "application/pdf") {
    const extracted = await extractPlainText(input.buffer, mimeType);
    if (extracted.ok && !isLikelyScannedPdf(extracted.text)) {
      const redacted = await redactForUpstream(
        extracted.text,
        { profile: input.dlpProfile },
        { timeoutMs: 60_000 },
      );
      const textExtract = toWithheldPlaceholders(redacted.text);
      const redactNote =
        redacted.redactionCount > 0
          ? ` Redacted ${redacted.redactionCount} sensitive item(s) before AI.`
          : " Privacy scan found no matched patterns.";
      return {
        status: "clean",
        mimeType,
        textExtract,
        redactedImage: null,
        detail: `Extracted via ${extracted.method}.${redactNote}${avNote}`,
      };
    }

    if (!imageOcrEnabled()) {
      return {
        status: "blocked",
        detail:
          "This PDF looks scanned (little or no text). Enable OCR (default) or upload a text PDF / DOCX / TXT.",
      };
    }

    const scanned = await redactScannedPdfForUpstream(
      input.buffer,
      input.dlpProfile,
    );
    if ("error" in scanned) {
      return { status: "blocked", detail: scanned.error };
    }
    return {
      status: "clean",
      mimeType,
      textExtract: scanned.redactedText,
      redactedImage: scanned.redactedPng,
      detail: `Scanned PDF: OCR + pixel redaction on ${scanned.pagesProcessed} page(s), ${scanned.boxesPainted} region(s) covered. Model receives redacted text only.${avNote}`,
    };
  }

  const extracted = await extractPlainText(input.buffer, mimeType);
  if (!extracted.ok) {
    return { status: "blocked", detail: extracted.reason };
  }

  const redacted = await redactForUpstream(
    extracted.text,
    { profile: input.dlpProfile },
    { timeoutMs: 60_000 },
  );
  const textExtract = toWithheldPlaceholders(redacted.text);
  const redactNote =
    redacted.redactionCount > 0
      ? ` Redacted ${redacted.redactionCount} sensitive item(s) before AI.`
      : " Privacy scan found no matched patterns.";

  return {
    status: "clean",
    mimeType,
    textExtract,
    redactedImage: null,
    detail: `Extracted via ${extracted.method}.${redactNote}${avNote}`,
  };
}
