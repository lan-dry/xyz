/**
 * Extract plain text from uploads before DLP + LLM.
 * Industry pattern (Purview / enterprise AI proxies): never send raw file bytes
 * to the model — extract → redact → send redacted text only.
 */

export type ExtractOutcome =
  | { ok: true; text: string; method: string }
  | { ok: false; reason: string; retryable?: boolean };

const MAX_EXTRACT_CHARS = 200_000;

function truncate(text: string): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= MAX_EXTRACT_CHARS) return cleaned;
  return cleaned.slice(0, MAX_EXTRACT_CHARS);
}

function isDocx(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // ZIP local file header
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString("binary");
  return head.includes("word/");
}

export function mimeNeedsTextExtract(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  if (m.startsWith("text/") || m === "application/csv") return true;
  if (m === "application/pdf") return true;
  if (
    m ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/msword"
  ) {
    return true;
  }
  if (m.startsWith("image/")) return true;
  return false;
}

async function extractPdf(buffer: Buffer): Promise<ExtractOutcome> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const text = truncate(parsed.text ?? "");
      if (!text) {
        return {
          ok: false,
          reason:
            "No readable text in this PDF (it may be scanned). OCR page render will be tried next.",
        };
      }
      return { ok: true, text, method: "pdf" };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    console.error("[stoa] pdf extract", error);
    return { ok: false, reason: "Could not read this PDF." };
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractOutcome> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = truncate(result.value ?? "");
    if (!text) {
      return { ok: false, reason: "No readable text in this Word document." };
    }
    return { ok: true, text, method: "docx" };
  } catch (error) {
    console.error("[stoa] docx extract", error);
    return { ok: false, reason: "Could not read this Word document." };
  }
}

async function extractImageOcr(buffer: Buffer): Promise<ExtractOutcome> {
  // Prefer scan.ts → redactImageForUpstream (OCR + pixel boxes). This path is fallback/tests.
  if (process.env.STOA_ATTACHMENT_OCR === "0") {
    return {
      ok: false,
      reason:
        "Image AI processing is disabled. Upload a PDF, DOCX, or TXT.",
    };
  }
  try {
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: () => undefined,
    });
    const text = truncate(result.data.text ?? "");
    if (!text) {
      return { ok: false, reason: "OCR found no readable text in this image." };
    }
    return { ok: true, text, method: "ocr" };
  } catch (error) {
    console.error("[stoa] image ocr", error);
    return {
      ok: false,
      reason: "OCR unavailable. Upload a PDF/DOCX/TXT instead.",
      retryable: true,
    };
  }
}

export async function extractPlainText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractOutcome> {
  const mime = mimeType.toLowerCase();

  if (mime.startsWith("text/") || mime === "application/csv") {
    const text = truncate(buffer.toString("utf8"));
    if (!text) {
      return { ok: false, reason: "This text file is empty." };
    }
    return { ok: true, text, method: "text" };
  }

  if (mime === "application/pdf") {
    return extractPdf(buffer);
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    isDocx(buffer)
  ) {
    return extractDocx(buffer);
  }

  if (mime === "application/msword") {
    return {
      ok: false,
      reason: "Legacy .doc files aren't supported. Save as .docx or PDF.",
    };
  }

  if (mime.startsWith("image/")) {
    return extractImageOcr(buffer);
  }

  return {
    ok: false,
    reason: "This file type can't be text-extracted for privacy review.",
  };
}
